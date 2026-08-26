import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance - lazy initialization
let pusherInstance: Pusher | null = null;

export const getPusherInstance = (): Pusher => {
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID || '';
    const key = process.env.PUSHER_KEY || '';
    const secret = process.env.PUSHER_SECRET || '';
    const cluster = process.env.PUSHER_CLUSTER || 'eu';

    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }
  return pusherInstance;
};

// For backward compatibility
export const pusher = getPusherInstance();

// Client-side Pusher instance - lazy initialization
let pusherClientInstance: PusherClient | null = null;

export const getPusherClient = (): PusherClient => {
  if (!pusherClientInstance) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY || '';
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu';

    pusherClientInstance = new PusherClient(key, {
      cluster,
    });
  }
  return pusherClientInstance;
};

// For backward compatibility
export const pusherClient = getPusherClient();

// Helper function to trigger notifications
export const triggerNotification = async (
  channel: string,
  event: string,
  data: any
) => {
  try {
    const pusher = getPusherInstance();
    await pusher.trigger(channel, event, data);
  } catch (error) {
    console.error('Error triggering Pusher event:', error);
  }
};

// Helper function to trigger user-specific notifications
export const triggerUserNotification = async (
  userId: string,
  notification: any
) => {
  await triggerNotification(`user-${userId}`, 'notification', notification);
};

// Helper function to trigger admin notifications
export const triggerAdminNotification = async (
  notification: any
) => {
  await triggerNotification('admin-notifications', 'new-notification', notification);
};
