import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const CHANNEL = 'shift-close'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

let channelReady: Promise<unknown> | null = null

function ensureChannel() {
  if (Platform.OS !== 'android') {
    return Promise.resolve()
  }
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL, {
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#FFC400',
    name: 'Shift closing',
    vibrationPattern: [0, 120, 80, 240],
  })
  return channelReady
}

export async function ensureReminderPermission() {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) {
    return true
  }
  if (!current.canAskAgain) {
    return false
  }
  return (await Notifications.requestPermissionsAsync()).granted
}

function lead(period: number) {
  // An hour before a daily shift closes; proportionally less for short demo shifts.
  return Math.min(3600, Math.floor(period / 4))
}

/**
 * Re-plan shift-close reminders for the active pact: one for the current shift if it is unpaid, and
 * one for each of the next two shifts. Called whenever the clock screen sees new state.
 */
export async function syncShiftReminders({
  closesAt,
  enabled,
  pactName,
  penalty,
  period,
  punchedToday,
}: {
  closesAt: number
  enabled: boolean
  pactName: string
  penalty: string
  period: number
  punchedToday: boolean
}) {
  await Notifications.cancelAllScheduledNotificationsAsync()
  if (!enabled || !(await Notifications.getPermissionsAsync()).granted) {
    return
  }
  await ensureChannel()
  const now = Date.now() / 1000
  const shifts = punchedToday ? [1, 2] : [0, 1, 2]
  for (const offset of shifts) {
    const fireAt = closesAt + offset * period - lead(period)
    if (fireAt <= now + 5) {
      continue
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        body: `${penalty} is on the line. One tap to punch in.`,
        title: `${pactName}: shift closes in ${Math.round(lead(period) / 60)} min`,
      },
      trigger: {
        channelId: CHANNEL,
        date: new Date(fireAt * 1000),
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    })
  }
}
