export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const requestData = await request.json();
      const { userId } = requestData;

      if (!userId) {
        return new Response(JSON.stringify({ success: false, message: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // **Karanta bayanan user daga Firebase**
      const userData = await getUserDataFromFirebase(userId, env);
      if (!userData) {
        return new Response(JSON.stringify({ success: false, message: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { fullName, email, phoneNumber, nin } = userData;
      if (!fullName || !email || !phoneNumber || !nin) {
        return new Response(JSON.stringify({ success: false, message: 'Incomplete user data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // **Samun Monnify Access Token**
      const monnifyAccessToken = await getMonnifyAccessToken(env);
      if (!monnifyAccessToken) {
        return new Response(JSON.stringify({ success: false, message: 'Failed to authenticate with Monnify' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // **Create a Monnify Customer ID**
      const monnifyCustomerId = `AFE-${userId}-${Date.now()}`;

      // **Create Virtual Account with Monnify**
      const virtualAccountResponse = await fetch('https://api.monnify.com/api/v2/bank-transfer/reserved-accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${monnifyAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountReference: monnifyCustomerId,
          accountName: fullName,
          currencyCode: 'NGN',
          contractCode: env.MONNIFY_CONTRACT_CODE, 
          customerEmail: email,
          customerName: fullName,
          customerBVN: nin,
          customerPhoneNumber: phoneNumber,
          bankCode: '035',
        }),
      });

      const accountData = await virtualAccountResponse.json();
      if (!accountData.requestSuccessful) {
        return new Response(JSON.stringify({ success: false, message: accountData.responseMessage }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const accountDetails = {
        bankName: 'Wema Bank',
        accountNumber: accountData.responseBody.accountNumber,
        accountName: fullName,
        monnifyCustomerId: monnifyCustomerId,
      };

      await saveToFirebase(userId, accountDetails, env);

      return new Response(JSON.stringify({ success: true, accountDetails }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};

// **Function: Samun bayanan user daga Firebase**
async function getUserDataFromFirebase(userId, env) {
  const firebaseUrl = `${env.FIREBASE_DATABASE_URL}/users/${userId}.json?auth=${env.FIREBASE_SECRET}`;
  const response = await fetch(firebaseUrl);
  if (!response.ok) return null;
  return await response.json();
}

// **Function: Ajiye bayanan virtual account a Firebase**
async function saveToFirebase(userId, accountDetails, env) {
  const firebaseUrl = `${env.FIREBASE_DATABASE_URL}/users/${userId}/accountDetails.json?auth=${env.FIREBASE_SECRET}`;
  await fetch(firebaseUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(accountDetails),
  });
}

// **Function: Samun Monnify Access Token**
async function getMonnifyAccessToken(env) {
  const authToken = btoa(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`);
  
  const response = await fetch("https://api.monnify.com/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  return data.requestSuccessful ? data.responseBody.accessToken : null;
}
