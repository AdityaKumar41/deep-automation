# Clerk Webhook Setup

This guide explains how to set up Clerk webhooks to sync user data to your database.

## What's Implemented

### User Model

- Syncs Clerk users to local database
- Tracks: email, firstName, lastName, imageUrl
- Automatic updates when user profile changes

### Webhook Events Handled

1. **User Events**
   - `user.created` - Creates user in database
   - `user.updated` - Updates user profile
   - `user.deleted` - Removes user from database

2. **Organization Events**
   - `organization.created` - Creates org with owner membership and free subscription
   - `organization.updated` - Updates org details
   - `organization.deleted` - Removes org and all related data

3. **Membership Events**
   - `organizationMembership.created` - Adds member to org
   - `organizationMembership.updated` - Updates member role
   - `organizationMembership.deleted` - Removes member from org

## Setup Instructions

### 1. Get Webhook Secret from Clerk

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Navigate to **Webhooks** in the sidebar
4. Click **+ Add Endpoint**
5. Enter your webhook URL: `https://your-api-domain.com/api/webhooks/clerk`
   - For local development: `http://localhost:3001/api/webhooks/clerk`
   - For production: `https://api.evolvx.ai/api/webhooks/clerk`

6. Select events to subscribe to:
   - ✅ user.created
   - ✅ user.updated
   - ✅ user.deleted
   - ✅ organization.created
   - ✅ organization.updated
   - ✅ organization.deleted
   - ✅ organizationMembership.created
   - ✅ organizationMembership.updated
   - ✅ organizationMembership.deleted

7. Click **Create**
8. Copy the **Signing Secret** (starts with `whsec_`)

### 2. Add Environment Variable

Add to your `.env` file in `apps/api`:

```bash
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. Local Development with ngrok (Optional)

For testing webhooks locally:

```bash
# Install ngrok
brew install ngrok

# Start your API server
cd apps/api
pnpm dev

# In another terminal, expose port 3001
ngrok http 3001

# Use the ngrok URL in Clerk webhook settings
# Example: https://abc123.ngrok.io/api/webhooks/clerk
```

### 4. Test the Webhook

1. Create a test user in Clerk
2. Check your API logs - you should see:

   ```
   Received Clerk webhook: user.created
   User clk_xxx synced to database
   ```

3. Verify in database:
   ```sql
   SELECT * FROM "User" WHERE "clerkUserId" = 'user_xxx';
   ```

## Security

- Webhooks are verified using Svix signatures
- Only requests with valid signatures are processed
- Webhook secret should never be committed to version control

## Troubleshooting

### Webhook verification failed

- Check that `CLERK_WEBHOOK_SECRET` is correctly set
- Ensure the secret matches the one in Clerk Dashboard
- Verify headers are being passed correctly

### User not found errors

- Users must be created via webhook before org operations
- Ensure `user.created` webhook is enabled and processed first

### Organization not syncing

- Check that `organization.created` webhook is enabled
- Verify the webhook endpoint is publicly accessible
- Check API logs for error messages

## Database Schema

### User Table

```prisma
model User {
  id              String   @id @default(cuid())
  clerkUserId     String   @unique
  email           String   @unique
  firstName       String?
  lastName        String?
  imageUrl        String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Member Table (Updated)

- Links to User via `userId` field
- Tracks membership in organizations
- Supports roles: OWNER, ADMIN, DEVELOPER, VIEWER

## Next Steps

After webhook setup:

1. All new Clerk users automatically sync to your database
2. Organization creation includes owner membership and free subscription
3. Member roles are automatically managed
4. User deletions are handled gracefully
