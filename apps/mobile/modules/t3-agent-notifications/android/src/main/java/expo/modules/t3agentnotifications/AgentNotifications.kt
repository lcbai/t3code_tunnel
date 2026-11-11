package expo.modules.t3agentnotifications

import android.app.NotificationChannel
import android.app.Notification
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat

class AgentActivityDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AgentNotifications.dismiss(context)
  }
}

class AgentActivityExpiryReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AgentNotifications.expire(context)
  }
}

object AgentNotifications {
  private const val STORE = "t3-agent-notifications"
  private const val ACTIVITY_CHANNEL = "agent-activity"
  private const val ALERT_CHANNEL = "agent-alerts"
  private const val ACTIVITY_TAG = "t3-agent-activity"
  private const val ALERT_TAG = "t3-agent-alert"
  private const val ACTIVITY_ID = 73001
  private const val RUNNING_LIFETIME_MS = 2 * 60 * 60 * 1000L

  @Synchronized
  fun dismiss(context: Context) {
    cancelActivity(context)
  }

  @Synchronized
  fun expire(context: Context, now: Long = System.currentTimeMillis()) {
    val expiresAt = context.getSharedPreferences(
      STORE,
      Context.MODE_PRIVATE
    ).getLong("expiresAt", 0)
    // An already-dispatched alarm must not remove a newer run's card.
    if (expiresAt > 0 && expiresAt <= now) cancelActivity(context)
  }

  private fun postAlert(
    context: Context,
    scheme: String,
    data: Map<String, String>,
    alertId: String
  ) {
    val title = data["alert_title"].orEmpty().take(120)
    // Grouped alerts list up to five 120-character thread titles.
    val body = data["alert_body"].orEmpty().take(608)
    val id = alertId.hashCode()
    val group = data["alert_group"]?.takeIf { it.isNotBlank() } ?: ALERT_TAG
    val notification = base(context, ALERT_CHANNEL)
      .setContentTitle(title).setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setGroup(group)
      .setContentIntent(contentIntent(context, scheme, data["alert_path"], id))
      .build()
    manager(context).notify(ALERT_TAG, id, notification)
    val children = manager(context).activeNotifications.filter {
      it.tag == ALERT_TAG && it.notification.group == group
    }
    if (children.size > 1) {
      val style = NotificationCompat.InboxStyle()
      children.forEach {
        style.addLine(it.notification.extras.getCharSequence(android.app.Notification.EXTRA_TEXT))
      }
      val summary = base(context, ALERT_CHANNEL)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(style)
        .setGroup(group)
        .setGroupSummary(true)
        .setSilent(true)
        .setAutoCancel(true)
        .setContentIntent(contentIntent(context, scheme, data["alert_path"], 0))
        .build()
      manager(context).notify("$ALERT_TAG-summary:$group", 0, summary)
    }
  }

  @Synchronized
  fun showcase(context: Context, scheme: String, data: Map<String, String>) {
    channels(context)
    data["alert_id"]?.let { postAlert(context, scheme, data, it) }
    showActivity(context, scheme, data, data["active"] == "true", RUNNING_LIFETIME_MS)
  }

  private fun showActivity(
    context: Context,
    scheme: String,
    data: Map<String, String>,
    active: Boolean,
    remainingMs: Long
  ) {
    val dismissIntent = PendingIntent.getBroadcast(
      context,
      ACTIVITY_ID,
      Intent(context, AgentActivityDismissReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val presentation = ActivityPresentation(data, active)
    val openThread = contentIntent(context, scheme, data["activity_path"], ACTIVITY_ID)
    // Retained results still need Android's ongoing flag to remain promoted.
    val ongoing = active || Build.VERSION.SDK_INT >= 36
    val builder = base(context, ACTIVITY_CHANNEL)
      .setOngoing(ongoing).setOnlyAlertOnce(true).setSilent(true)
      .setTimeoutAfter(remainingMs)
      // Live Updates must remain uncolorized to qualify for promotion.
      .setColorized(false)
      .setRequestPromotedOngoing(ongoing)
      .setShortCriticalText(if (ongoing) presentation.chip else null)
      .setContentIntent(openThread)
      .setDeleteIntent(dismissIntent)
    presentation.applyTo(builder, context)
    val action = presentation.action
    if (action != null && openThread != null) builder.addAction(0, action, openThread)
    if (ongoing) builder.addAction(0, "关闭", dismissIntent)
    manager(context).notify(ACTIVITY_TAG, ACTIVITY_ID, builder.build())
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      // Notification timeouts were added in API 26. One inexact alarm also
      // expires cards on Android 7, including when the app process has exited.
      // No exact-alarm permission, foreground service or periodic work needed.
      val expiresAt = System.currentTimeMillis() + remainingMs
      context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit()
        .putLong("expiresAt", expiresAt).apply()
      context.getSystemService(
        AlarmManager::class.java
      ).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, expiresAt, expiryIntent(context))
    }
  }

  private fun expiryIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    ACTIVITY_ID,
    Intent(context, AgentActivityExpiryReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun cancelActivity(context: Context) {
    manager(context).cancel(ACTIVITY_TAG, ACTIVITY_ID)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      context.getSystemService(AlarmManager::class.java).cancel(expiryIntent(context))
      context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().remove("expiresAt").apply()
    }
  }

  private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

  private fun channels(context: Context) {
    if (Build.VERSION.SDK_INT >= 26) {
      manager(context).createNotificationChannels(
        listOf(
          NotificationChannel(ALERT_CHANNEL, "智能体通知", NotificationManager.IMPORTANCE_HIGH),
          NotificationChannel(
            ACTIVITY_CHANNEL,
            "智能体活动",
            NotificationManager.IMPORTANCE_LOW
          ),
        )
      )
    }
  }

  private fun base(context: Context, channel: String): NotificationCompat.Builder =
    NotificationCompat.Builder(context, channel)
      .setPriority(
        if (channel ==
          ALERT_CHANNEL
        ) {
          NotificationCompat.PRIORITY_HIGH
        } else {
          NotificationCompat.PRIORITY_LOW
        }
      )
      .setDefaults(if (channel == ALERT_CHANNEL) Notification.DEFAULT_ALL else 0)
      .setSmallIcon(R.drawable.agent_activity_mark)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setShowWhen(false)

  private fun contentIntent(
    context: Context,
    scheme: String,
    path: String?,
    id: Int
  ): PendingIntent? {
    val threadPath = path?.takeIf { it.startsWith("/threads/") }
    val route = threadPath?.takeUnless { it.contains('?') || it.contains('#') } ?: "/"
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: return null
    intent.setAction(Intent.ACTION_VIEW).setData(Uri.parse("$scheme:/$route"))
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      id,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
