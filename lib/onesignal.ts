/**
 * OneSignal API utilities for sending push notifications
 */

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';
const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

interface OneSignalNotification {
  app_id: string;
  headings?: { [key: string]: string };
  contents: { [key: string]: string };
  included_segments?: string[];
  include_player_ids?: string[];
  include_external_user_ids?: string[];
  data?: any;
  url?: string;
  ios_badgeType?: string;
  ios_badgeCount?: number;
  web_url?: string;
  chrome_web_icon?: string;
  chrome_web_image?: string;
}

export async function sendOneSignalNotification(notification: {
  title: string;
  message: string;
  url?: string;
  imageUrl?: string;
  targetUsers?: string[]; // external user IDs
  segments?: string[]; // OneSignal segments
}): Promise<any> {
  if (!ONESIGNAL_REST_API_KEY) {
    console.warn('OneSignal REST API key not configured');
    return null;
  }

  const payload: OneSignalNotification = {
    app_id: ONESIGNAL_APP_ID,
    headings: {
      en: notification.title
    },
    contents: {
      en: notification.message
    },
    data: {
      custom_data: 'admin_notification'
    }
  };

  // Add URL if provided
  if (notification.url) {
    payload.url = notification.url;
    payload.web_url = notification.url;
  }

  // Add image if provided
  if (notification.imageUrl) {
    payload.chrome_web_icon = notification.imageUrl;
    payload.chrome_web_image = notification.imageUrl;
  }

  // Target specific users or segments
  if (notification.targetUsers && notification.targetUsers.length > 0) {
    payload.include_external_user_ids = notification.targetUsers;
  } else if (notification.segments && notification.segments.length > 0) {
    payload.included_segments = notification.segments;
  } else {
    // Default to all subscribed users
    payload.included_segments = ['Subscribed Users'];
  }

  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('OneSignal API error:', result);
      throw new Error(`OneSignal API error: ${result.errors?.join(', ') || 'Unknown error'}`);
    }

    console.log('OneSignal notification sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending OneSignal notification:', error);
    throw error;
  }
}

/**
 * Send notification to specific user by external user ID
 */
export async function sendOneSignalToUser(
  userId: string,
  title: string,
  message: string,
  options?: {
    url?: string;
    imageUrl?: string;
  }
): Promise<any> {
  return sendOneSignalNotification({
    title,
    message,
    url: options?.url,
    imageUrl: options?.imageUrl,
    targetUsers: [userId]
  });
}

/**
 * Send notification to all subscribed users
 */
export async function sendOneSignalToAll(
  title: string,
  message: string,
  options?: {
    url?: string;
    imageUrl?: string;
  }
): Promise<any> {
  return sendOneSignalNotification({
    title,
    message,
    url: options?.url,
    imageUrl: options?.imageUrl,
    segments: ['Subscribed Users']
  });
}

/**
 * Send notification to specific segments
 */
export async function sendOneSignalToSegments(
  segments: string[],
  title: string,
  message: string,
  options?: {
    url?: string;
    imageUrl?: string;
  }
): Promise<any> {
  return sendOneSignalNotification({
    title,
    message,
    url: options?.url,
    imageUrl: options?.imageUrl,
    segments
  });
}
