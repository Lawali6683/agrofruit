export default {
  async fetch(request, env) {
    try {      
      if (request.method !== 'POST') {
        return new Response('Only POST requests are allowed', { status: 405 });
      }
      
      const { fullName, email, phoneNumber, paystackCustomerId } = await request.json();
     
      if (!fullName || !email || !phoneNumber || !paystackCustomerId) {
        return new Response('Missing required fields', { status: 400 });
      }
     
      const paystackData = {
        customer: paystackCustomerId,
        preferred_bank: 'wema-bank',
        account_name: fullName, 
        email: email,
        phone: phoneNumber
      };
     
      const paystackResponse = await fetch('https://api.paystack.co/dedicated_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paystackData)
      });
      
      const paystackResult = await paystackResponse.json();
      
      if (paystackResponse.ok && paystackResult.status) {
        
        return new Response(JSON.stringify({
          accountNumber: paystackResult.data.account_number,
          bankName: paystackResult.data.bank.name,
          accountName: paystackResult.data.account_name, 
          email: email
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        
        return new Response(JSON.stringify({
          error: paystackResult.message || 'Failed to create virtual account'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
