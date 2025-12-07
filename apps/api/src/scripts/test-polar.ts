import { getPolarClient } from '../services/polar';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars from apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testPolar() {
    console.log('--- Polar Debug Script ---');
    console.log('POLAR_ENVIRONMENT:', process.env.POLAR_ENVIRONMENT);
    console.log('POLAR_API_URL:', process.env.POLAR_API_URL);
    console.log('POLAR_ACCESS_TOKEN:', process.env.POLAR_ACCESS_TOKEN ? 'set' : 'missing');
    
    // Check Price IDs - matching what's in .env now
    const proPriceId = process.env.POLAR_PRODUCT_ID_PRO_MONTHLY;
    const teamPriceId = process.env.POLAR_PRODUCT_ID_TEAM_MONTHLY;
    
    console.log('POLAR_PRODUCT_ID_PRO_MONTHLY:', proPriceId);
    console.log('POLAR_PRODUCT_ID_TEAM_MONTHLY:', teamPriceId);

    if (!proPriceId) {
        console.error('Error: POLAR_PRODUCT_ID_PRO_MONTHLY is missing');
    }

    const polar = getPolarClient();

    try {
        console.log('Attempting to list products/checkouts to verify auth...');
        // Try a simple read operation
        // const products = await polar.products.list({});
        console.log('Skipping product list check (requires orgId).');
        // console.log(`Found ${products.result.items.length} products.`);
    } catch (e: any) {
        console.error('Failed to connect or list products:', e.message);
        console.error('Full error:', JSON.stringify(e, null, 2));
    }

    if (proPriceId) {
        try {
            console.log(`Attempting to create checkout for PRO plan (${proPriceId})...`);
            const checkout = await polar.checkouts.create({
                productPriceId: proPriceId,
                successUrl: 'http://localhost:3000/success',
            });
            console.log('Checkout created successfully:', checkout.url);
        } catch (e: any) {
            console.error('Failed to create checkout:', e.message);
             console.error('Full error:', JSON.stringify(e, null, 2));
        }
    }
}

testPolar().catch(console.error);
