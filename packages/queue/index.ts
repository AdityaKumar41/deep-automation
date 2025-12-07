import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

// Kafka client singleton
let kafka: Kafka | null = null;
let producer: Producer | null = null;

/**
 * Initialize Kafka client
 */
export function getKafka(): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: 'evolvx-ai',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });
  }
  return kafka;
}

/**
 * Get Kafka producer (singleton)
 */
export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = getKafka().producer();
    await producer.connect();
  }
  return producer;
}

/**
 * Event types from PRD
 */
export enum EventType {
  // Repository events
  REPO_ANALYZED = 'repo.analyzed',
  
  // Workflow events
  WORKFLOW_GENERATED = 'workflow.generated',
  
  // Deployment events
  DEPLOYMENT_STARTED = 'deployment.started',
  DEPLOYMENT_BUILDING = 'deployment.building',
  DEPLOYMENT_DEPLOYING = 'deployment.deploying',
  DEPLOYMENT_COMPLETED = 'deployment.completed',
  DEPLOYMENT_FAILED = 'deployment.failed',
  DEPLOYMENT_QUEUED = 'deployment.queued',
  
  // Metrics events
  METRICS_COLLECTED = 'metrics.collected',
  
  // Monitoring events
  MONITORING_ALERT = 'monitoring.alert',
  MONITORING_INSIGHT = 'monitoring.insight',
  
  // User events
  USER_NOTIFICATION = 'user.notification',
  MEMBER_INVITED = 'member.invited',
  MEMBER_JOINED = 'member.joined',
  
  // Email events
  EMAIL_SEND = 'email.send',
}

/**
 * Event payload interfaces
 */
export interface RepoAnalyzedEvent {
  projectId: string;
  repoUrl: string;
  framework: string;
  analysis: any;
}

export interface WorkflowGeneratedEvent {
  projectId: string;
  workflowType: 'GITHUB_ACTIONS' | 'TRIVX_RUNNER';
  workflow: string;
}

export interface DeploymentEvent {
  deploymentId: string;
  projectId: string;
  status: string;
  error?: string;
}

export interface EmailEvent {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

export interface MemberInvitedEvent {
  organizationId: string;
  email: string;
  role: string;
  invitedBy: string;
}

/**
 * Publish event to Kafka
 */
export async function publishEvent<T = any>(
  topic: EventType,
  payload: T,
  key?: string
): Promise<void> {
  try {
    const prod = await getProducer();
    
    await prod.send({
      topic,
      messages: [
        {
          key: key || Date.now().toString(),
          value: JSON.stringify(payload),
          timestamp: Date.now().toString(),
        },
      ],
    });

    console.log(`✅ Event published: ${topic}`, { key });
  } catch (error) {
    console.error(`❌ Failed to publish event: ${topic}`, error);
    throw error;
  }
}

/**
 * Subscribe to Kafka topic
 */
export async function subscribeToTopic(
  topic: EventType,
  groupId: string,
  handler: (payload: any) => Promise<void>
): Promise<Consumer> {
  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId });

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      try {
        const payload = JSON.parse(message.value?.toString() || '{}');
        await handler(payload);
        console.log(`✅ Processed event from ${topic}`, { partition });
      } catch (error) {
        console.error(`❌ Error processing message from ${topic}:`, error);
        // Could implement dead letter queue here
      }
    },
  });

  return consumer;
}

/**
 * Create all required topics
 */
export async function createTopics(): Promise<void> {
  const kafka = getKafka();
  const admin = kafka.admin();
  
  try {
    await admin.connect();
    
    const topics = Object.values(EventType).map((topic) => ({
      topic,
      numPartitions: 3,
      replicationFactor: 1,
    }));

    await admin.createTopics({
      topics,
      waitForLeaders: true,
    });

    console.log('✅ Kafka topics created successfully');
  } catch (error: any) {
    if (error.type !== 'TOPIC_ALREADY_EXISTS') {
      console.error('❌ Failed to create Kafka topics:', error);
    }
  } finally {
    await admin.disconnect();
  }
}

/**
 * Graceful shutdown
 */
export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
  kafka = null;
}
