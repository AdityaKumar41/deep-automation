import { z } from 'zod';
import axios from 'axios';
import { McpTool } from '../types';

export const SlackNotifySchema = z.object({
  webhookUrl: z.string().url(),
  message: z.string(),
  channel: z.string().optional(),
  username: z.string().optional(),
});

export const SlackNotifyTool: McpTool = {
  name: 'slack_notify',
  description: 'Send a notification to a Slack channel via webhook',
  schema: SlackNotifySchema,
  execute: async (args: z.infer<typeof SlackNotifySchema>) => {
    try {
      const payload: any = {
        text: args.message,
      };

      if (args.channel) payload.channel = args.channel;
      if (args.username) payload.username = args.username;

      await axios.post(args.webhookUrl, payload);
      return { success: true, message: 'Notification sent' };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
};
