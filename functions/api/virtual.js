export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Only POST requests are allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let requestData;
    try {
      requestData = await request.json();
    } catch (error) {
      console.error("Invalid JSON format:", error);
      return new Response(JSON.stringify({ error: 'Invalid JSON data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { fullName, email, phoneNumber, paystackCustomerId } = requestData;

    if (!fullName || !email || !phoneNumber || !paystackCustomerId) {
      console.error("Missing required fields:", { fullName, email, phoneNumber, paystackCustomerId });
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const paystackData = {
      customer: paystackCustomerId,
      preferred_bank: "wema-bank",
      account_name: fullName,
      email: email,
      phone: phoneNumber
    };

    console.log("Sending request to Paystack:", paystackData);

    const paystackResponse = await fetch('https://api.paystack.co/dedicated_account', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer sk_live_c7dea73bd75e9e45f5d5e63620b7526811cd1be2`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paystackData)
    });

    const paystackResult = await paystackResponse.json();
    console.log("Paystack Response:", paystackResult);

    if (paystackResponse.ok && paystackResult.status) {
      return new Response(JSON.stringify({
        status: "success",
        message: "Virtual account created successfully",
        accountNumber: paystackResult.data.account_number,
        bankName: paystackResult.data.bank.name,
        accountName: paystackResult.data.account_name,
        customerId: paystackCustomerId,
        email: email,
        phoneNumber: phoneNumber
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.error("Paystack API error:", paystackResult);
      return new Response(JSON.stringify({
        status: "failed",
        error: paystackResult.message || 'Failed to create virtual account'
      }), {
        status: paystackResponse.status || 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error("Unexpected server error:", error);
    return new Response(JSON.stringify({ status: "error", error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
