import { AuthMcpClientAccess } from "@t3tools/contracts";
import { useId } from "react";

import { accessConfig } from "../auth/ConnectAgentSurface";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

/** What agents here may do in an environment being linked, with what that does not allow. */
export function LinkAccessPicker({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: AuthMcpClientAccess;
  readonly onChange: (access: AuthMcpClientAccess) => void;
  readonly disabled?: boolean;
}) {
  const labelId = useId();
  const selected = accessConfig[value];
  return (
    <div className="space-y-1.5">
      <span id={labelId} className="block text-xs font-medium">
        这儿的特工可能在那里做什么
      </span>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null) onChange(next as AuthMcpClientAccess);
        }}
      >
        <SelectTrigger aria-labelledby={labelId}>
          <SelectValue>
            <span className="flex items-center gap-2">
              <selected.icon aria-hidden className="size-4" />
              {selected.label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          {AuthMcpClientAccess.literals.map((option) => {
            const { label, description, icon: Icon } = accessConfig[option];
            return (
              <SelectItem key={option} value={option} hideIndicator>
                <span className="grid min-w-0 gap-0.5 py-0.5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                    {label}
                  </span>
                  <span className="text-xs leading-4 text-muted-foreground">{description}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectPopup>
      </Select>
      <p className="text-xs text-muted-foreground">
        {selected.description}{" "}
        一个代理从没有比它自己的模式更多的访问。在完全访问下，它只能改变启动的链接的会话，而不是机器自己的会话、工程或设置。
      </p>
    </div>
  );
}
