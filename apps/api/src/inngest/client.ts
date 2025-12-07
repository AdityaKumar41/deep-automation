import { Inngest } from 'inngest';

// Create Inngest client
export const inngest = new Inngest({
  id: 'evolvx-ai',
  name: 'Evolvx AI',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
