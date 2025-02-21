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

    if (!fullName || !email || !phoneNumber) {
      console.error("Missing required fields:", { fullName, email, phoneNumber });
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Raba fullName zuwa firstName da lastName
    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "N/A"; // Idan babu lastName, za a cike da "N/A"

    let customerId = paystackCustomerId;

    // Idan babu paystackCustomerId, sai a kirkiri sabon customer
    if (!customerId) {
      const customerData = {
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phoneNumber
      };

      console.log("Creating new Paystack customer:", customerData);

      const customerResponse = await fetch('https://api.paystack.co/customer', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(customerData)
      });

      const customerResult = await customerResponse.json();
      console.log("Paystack Customer Response:", customerResult);

      if (!customerResponse.ok || !customerResult.status) {
        return new Response(JSON.stringify({
          status: "failed",
          error: customerResult.message || 'Failed to create Paystack customer'
        }), {
          status: customerResponse.status || 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      customerId = customerResult.data.customer_code; // Ajiye customer ID
    }

    const paystackData = {
      customer: customerId,
      preferred_bank: "wema-bank"
    };

    console.log("Sending request to Paystack:", paystackData);

    const paystackResponse = await fetch('https://api.paystack.co/dedicated_account', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}`,
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
        bankName: paystackResult.data.bank.name
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
