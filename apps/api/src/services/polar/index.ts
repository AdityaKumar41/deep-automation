import { Polar } from "@polar-sh/sdk";

// Initialize Polar SDK
export const getPolarClient = () => {
    const accessToken = process.env.POLAR_ACCESS_TOKEN;
    const server = process.env.POLAR_ENVIRONMENT as "sandbox" | "production" || "sandbox";
    
    if (!accessToken) {
        console.warn("POLAR_ACCESS_TOKEN is not set. Billing features will not work.");
    }

    return new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN || "",
        server,
    });
};

export const POLAR_PRODUCT_IDS = {
    FREE: process.env.POLAR_PRODUCT_ID_FREE,
    PRO_MONTHLY: process.env.POLAR_PRODUCT_ID_PRO_MONTHLY,
    TEAM_MONTHLY: process.env.POLAR_PRODUCT_ID_TEAM_MONTHLY,
};

export const reportUsage = async (polarCustomerId: string, metricName: string, amount: number) => {
    // Placeholder for Polar usage reporting
    // Example:
    // const polar = getPolarClient();
    // await polar.events.create({ ... })
    console.log(`[Polar] Reporting usage: ${metricName} = ${amount} for ${polarCustomerId}`);
};
