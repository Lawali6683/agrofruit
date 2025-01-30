import fetch from "node-fetch";

// Samu keys daga environment variables
const apiKey = process.env.MONNIFY_API_KEY;
const secretKey = process.env.MONNIFY_SECRET_KEY;

// Function don samun access token
export async function getMonnifyAccessToken() {
    try {
        const authToken = btoa(`${apiKey}:${secretKey}`);

        const response = await fetch("https://api.monnify.com/api/v1/auth/login", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${authToken}`,
                "Content-Type": "application/json",
            },
        });

        const data = await response.json();
        if (data.requestSuccessful) {
            return data.responseBody.accessToken;
        } else {
            throw new Error(data.responseMessage || "Failed to get access token.");
        }
    } catch (error) {
        console.error("Error fetching Monnify access token:", error.message);
        throw error;
    }
}
