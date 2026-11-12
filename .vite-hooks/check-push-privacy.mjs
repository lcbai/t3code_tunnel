import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const zeroId = /^0+$/;
const privateKey = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
const providerCredential =
  /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|LTAI[A-Za-z0-9]{12,28}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{18,}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})\b/;
const personalEmail =
  /\b[\w.+-]+@(?:gmail\.com|hotmail\.com|outlook\.com|icloud\.com|yahoo\.com|qq\.com|foxmail\.com|163\.com|126\.com|proton\.me|protonmail\.com)\b/i;
const credentialField =
  /\b(ak|sk|[\w.-]*(?:token|password|passwd|api[_-]?key|access[_-]?key(?:[_-]?(?:id|secret))?|secret(?:[_-]?key)?|cookie))["']?\s*[:=]\s*(?:(["'])([^"'\r\n]+)\2|([A-Za-z0-9_+./=!%-]{8,}))/gi;
const placeholder =
  /^(?:[<{$]|(?:example|sample|placeholder|replace|changeme|your|fake|test|dummy)(?:[-_\s]|$)|(?:process\.env|import\.meta)\b)/i;
const networkContext =
  /\b(?:ssh|scp|rsync|host(?:name)?|server(?:[_-]?(?:ip|addr|address))?|ip(?:v[46])?|proxy_pass|bind(?:addr)?)\b|(?:https?|wss?):\/\/|@|服务器|公网|内网|地址/i;
const ipLiteral =
  /\b(?:\d{1,3}\.){3}\d{1,3}\b|(?<![\w:])(?:[a-f\d]{0,4}:){2,7}[a-f\d]{0,4}(?![\w:])/gi;
const exampleUsers = new Set(["user", "username", "runner", "example", "demo", "alice", "bob"]);

function git(args, options = {}) {
  const result = NodeChildProcess.spawnSync("git", ["--no-replace-objects", ...args], {
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) return null;
  const bytes = result.stdout;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff && bytes.length % 2 === 0) {
    return bytes.subarray(2).swap16().toString("utf16le");
  }
  return bytes.toString("utf8");
}

function readGit(args, options) {
  const result = git(args, options);
  if (result === null) throw new Error("Git object lookup failed");
  return result;
}

function privateValues() {
  const file = NodePath.join(
    readGit(["rev-parse", "--git-common-dir"]).trim(),
    "info",
    "t3-private-values",
  );
  const saved = NodeFS.existsSync(file) ? NodeFS.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const home = NodeOS.homedir().replace(/\\+/g, "/");
  if (home !== "/" && home !== "/root") saved.push(home);
  return saved.map((value) => value.trim().replace(/\\+/g, "/").toLowerCase()).filter(Boolean);
}

function isPrivateAddress(address) {
  if (NodeNet.isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a !== 0 &&
      a !== 127 &&
      !(a === 192 && b === 0 && c === 2) &&
      !(a === 198 && b === 51 && c === 100) &&
      !(a === 203 && b === 0 && c === 113)
    );
  }
  return (
    NodeNet.isIP(address) === 6 &&
    address !== "::" &&
    address !== "::1" &&
    !address.toLowerCase().startsWith("2001:db8:")
  );
}

function sensitiveFile(path) {
  const name = path.split("/").at(-1).toLowerCase();
  return (
    (/^\.env(?:\.|$)/.test(name) && !/\.(?:example|sample|template)$/.test(name)) ||
    /^(?:id_(?:rsa|ed25519|ecdsa|dsa)|(?:frp[-_]?)?token|t3-private-values|credentials(?:\.json)?|service[-_]account\.json)$/.test(
      name,
    ) ||
    /\.(?:key|p12|pfx|jks|keystore|mobileprovision|sqlite3?|sqlitedb|db|har)$/.test(name)
  );
}

function issuesIn(text, values, isPath = false) {
  const issues = new Set();
  const normalized = text.replace(/\\+/g, "/");
  const lower = normalized.toLowerCase();
  if (values.some((value) => lower.includes(value))) issues.add("本机私有信息");
  for (const match of normalized.matchAll(/(?:\/(?:Users|home)\/)([\p{L}\p{N}._-]+)\//giu)) {
    if (!exampleUsers.has(match[1].toLowerCase())) issues.add("个人目录");
  }
  if (/~\/(?:Desktop|Downloads|Documents|Pictures)\//i.test(normalized)) issues.add("个人目录");
  if (privateKey.test(text)) issues.add("私钥");
  if (providerCredential.test(text)) issues.add("Token 或访问密钥");
  if (personalEmail.test(text)) issues.add("个人邮箱");
  if (/\b(?:https?|wss?|ftp):\/\/[^\s/@:]+:[^\s/@]+@/i.test(text)) issues.add("带凭据的 URL");
  if (/\b(?:Bearer|Basic)\s+[A-Za-z0-9_+./=-]{20,}\b/i.test(text)) issues.add("认证凭据");
  for (const match of text.matchAll(credentialField)) {
    const [, key, quote, quoted, unquoted] = match;
    const value = (quoted ?? unquoted).trim();
    if (
      value.length >= 8 &&
      !placeholder.test(value) &&
      (quote || /^[A-Z0-9_]+$/.test(key) || /[\d+/=!%-]/.test(value))
    ) {
      issues.add("明文凭据");
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const networkLine = isPath || networkContext.test(line);
    const literalLine = line.trim().replace(/^["'\x60\x5b]|["'\x60\x5d]$/g, "");
    if (
      [...line.matchAll(ipLiteral)].some(
        ([address]) => (networkLine || literalLine === address) && isPrivateAddress(address),
      )
    ) {
      issues.add("IP 地址");
    }
  }
  return issues;
}

function pendingUpdates(input) {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [localRef, local, remoteRef, remote, extra] = line.trim().split(/\s+/);
      if (!remoteRef || extra || !objectId.test(local) || !objectId.test(remote)) {
        throw new Error("Invalid pre-push input");
      }
      return { localRef, local, remoteRef, remote };
    })
    .filter(({ local }) => !zeroId.test(local));
}

function remoteCommits(updates, remoteUrl) {
  const found = new Set();
  const addCommit = (oid) => {
    if (!objectId.test(oid) || zeroId.test(oid)) return false;
    const commit = git(["rev-parse", "--verify", oid + "^{commit}"])?.trim();
    if (!commit) return false;
    found.add(commit);
    return true;
  };
  const unresolved = updates.map(({ remote }) => addCommit(remote)).some((known) => !known);
  if (unresolved && remoteUrl) {
    const refs = git(["ls-remote", "--refs", "--", remoteUrl], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 15_000,
    });
    for (const line of refs?.split("\n") ?? []) addCommit(line.split("\t", 1)[0]);
  }
  return found;
}

function scan(updates, remoteUrl) {
  const values = privateValues();
  const commits = new Set();
  const seenTags = new Set();
  const cachedBlobs = new Map();
  const findings = new Set();
  const report = (oid, location, issues) => {
    for (const issue of issues) findings.add(oid.slice(0, 10) + " " + location + " · " + issue);
  };
  const scanPath = (object, owner, path) => {
    const issues = issuesIn(path, values, true);
    if (sensitiveFile(path)) issues.add("敏感文件");
    report(owner, "[文件路径 " + object.slice(0, 10) + "]", issues);
  };
  const scanBlob = (object, owner, path) => {
    if (path) scanPath(object, owner, path);
    if (!cachedBlobs.has(object)) {
      cachedBlobs.set(object, issuesIn(readGit(["cat-file", "blob", object]), values));
    }
    report(owner, "[文件对象 " + object.slice(0, 10) + "]", cachedBlobs.get(object));
  };
  const scanObject = (oid) => {
    const type = readGit(["cat-file", "-t", oid]).trim();
    if (type === "commit") commits.add(oid);
    else if (type === "blob") scanBlob(oid, oid);
    else if (type === "tree") {
      for (const entry of readGit(["ls-tree", "-r", "-z", oid]).split("\0").filter(Boolean)) {
        const tab = entry.indexOf("\t");
        const [, kind, object] = entry.slice(0, tab).split(" ");
        const path = entry.slice(tab + 1);
        if (kind === "blob") scanBlob(object, oid, path);
        else scanPath(object, oid, path);
      }
    } else if (type === "tag" && !seenTags.has(oid)) {
      seenTags.add(oid);
      const body = readGit(["cat-file", "tag", oid]);
      report(oid, "[标签信息]", issuesIn(body, values));
      const target = /^object ([a-f0-9]+)\n/.exec(body)?.[1];
      if (!target || !objectId.test(target)) throw new Error("Invalid tag");
      scanObject(target);
    }
  };

  for (const { localRef, local, remoteRef } of updates) {
    report(local, "[引用名称]", issuesIn(localRef + "\n" + remoteRef, values, true));
    scanObject(local);
  }
  if (!commits.size) return findings;
  const excluded = remoteCommits(updates, remoteUrl);
  const revisions = [...commits, ...[...excluded].map((oid) => "^" + oid)].join("\n") + "\n";
  const pending = readGit(["rev-list", "--stdin"], { input: revisions })
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const commit of pending) {
    report(commit, "[提交信息]", issuesIn(readGit(["cat-file", "commit", commit]), values));
    const changes = readGit([
      "diff-tree",
      "--root",
      "-m",
      "-r",
      "--raw",
      "-z",
      "--no-abbrev",
      "--no-renames",
      "--diff-filter=ACMT",
      "--no-commit-id",
      commit,
      "--",
    ]).split("\0");
    for (let i = 0; i < changes.length - 1; i += 2) {
      const [, mode, , blob] = changes[i].split(" ");
      const path = changes[i + 1];
      if (mode === "160000") scanPath(blob, commit, path);
      else scanBlob(blob, commit, path);
    }
  }
  return findings;
}

try {
  const updates = pendingUpdates(NodeFS.readFileSync(0, "utf8"));
  const findings = updates.length ? scan(updates, process.argv[3]) : new Set();
  if (findings.size) {
    process.stderr.write("推送已阻止。待上传提交可能包含私人信息：\n");
    for (const finding of [...findings].slice(0, 20)) process.stderr.write("  " + finding + "\n");
    if (findings.size > 20)
      process.stderr.write("  其余 " + (findings.size - 20) + " 项未显示。\n");
    process.exitCode = 1;
  }
} catch {
  process.stderr.write("推送已阻止。隐私检查无法完整读取待上传的 Git 对象。\n");
  process.exitCode = 1;
}
