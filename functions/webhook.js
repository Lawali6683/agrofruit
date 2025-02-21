export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let bodyText;
  try {
    bodyText = await request.text();
  } catch (error) {
    return new Response("Invalid Request Body", { status: 400 });
  }

  const signature = request.headers.get("X-Signature");
  if (!signature) {
    return new Response("Missing Signature", { status: 400 });
  }

  const secret = env.WEBHOOK_SECRET;
  const isValid = await verifySignature(secret, bodyText, signature);
  if (!isValid) {
    return new Response("Invalid Signature", { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { event, data } = body;
  if (event === "charge.success") {
    return await processDeposit(data, env);
  } else if (event === "transfer.success") {
    return await processWithdrawal(data, env);
  } else {
    return new Response("Invalid Event", { status: 400 });
  }
}

async function verifySignature(secret, body, signature) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signatureBuffer = Uint8Array.from(
    atob(signature.replace(/_/g, "/").replace(/-/g, "+")),
    c => c.charCodeAt(0)
  );

  const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

  return crypto.subtle.timingSafeEqual(expectedSignature, signatureBuffer);
}

async function processDeposit(data, env) {
  if (!data || data.status !== "success") {
    return new Response("Transaction not verified", { status: 400 });
  }

  const email = data.customer.email;
  const amount = data.amount / 100;
  const userUid = await getUserUidByEmail(email, env);
  if (!userUid) return new Response("User not found", { status: 400 });

  await updateInvestment(userUid, amount, env);
  return new Response("Payment verified and investment updated", { status: 200 });
}

async function processWithdrawal(data, env) {
  if (!data || data.status !== "success") {
    return new Response("Transaction not verified", { status: 400 });
  }

  const email = data.recipient.details.email;
  const amount = data.amount / 100;
  const networkFee = amount * 0.07;
  const totalAmount = amount + networkFee;

  const userUid = await getUserUidByEmail(email, env);
  if (!userUid) return new Response("User not found", { status: 400 });

  const userData = await fetch(`${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`).then(res => res.json());

  if (userData.userBalance >= totalAmount) {
    await fetch(`${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userBalance: userData.userBalance - totalAmount }),
    });

    await updateAdminBalance(networkFee, env);
    return new Response("Withdrawal successful", { status: 200 });
  } else {
    return new Response("Insufficient balance", { status: 400 });
  }
}

async function getUserUidByEmail(email, env) {
  const usersData = await fetch(`${env.FIREBASE_DATABASE_URL}/users.json?auth=${env.FIREBASE_SECRET}`).then(res => res.json());
  
  for (let userId in usersData) {
    if (usersData[userId].email === email) {
      return userId;
    }
  }
  return null;
}

async function updateInvestment(userUid, amount, env) {
  const userData = await fetch(`${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`).then(res => res.json());
  
  await fetch(`${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ investment: (userData.investment || 0) + amount }),
  });
}

async function updateAdminBalance(networkFee, env) {
  const usersData = await fetch(`${env.FIREBASE_DATABASE_URL}/users.json?auth=${env.FIREBASE_SECRET}`).then(res => res.json());

  let adminUid = Object.keys(usersData).find(userId => usersData[userId].email === "harunalawali5522@gmail.com");
  if (!adminUid) return;

  const adminData = await fetch(`${env.FIREBASE_DATABASE_URL}/users/${adminUid}.json?auth=${env.FIREBASE_SECRET}`).then(res => res.json());

  await fetch(`${env.FIREBASE_DATABASE_URL}/users/${adminUid}.json?auth=${env.FIREBASE_SECRET}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ networkFee: (adminData.networkFee || 0) + networkFee }),
  });
}
