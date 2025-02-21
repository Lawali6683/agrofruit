export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      // Karɓar bayanan webhook
      const rawBody = await request.text();
      const payload = JSON.parse(rawBody);
      const { event, data } = payload;
      const { amount, customer } = data;
      const email = customer.email;

      // Samun Firebase database URL da secret
      const dbUrl = env.FIREBASE_DATABASE_URL;
      const secret = env.FIREBASE_SECRET;

      // Karɓo duk users daga Firebase
      const userResponse = await fetch(`${dbUrl}/users.json?auth=${secret}`);
      const users = await userResponse.json();

      let userId = null;
      let userBalance = 0;
      let investment = 0;

      // Nemo mai amfani da email dinsa
      for (const id in users) {
        if (users[id].email === email) {
          userId = id;
          userBalance = users[id].userBalance || 0;
          investment = users[id].investment || 0;
          break;
        }
      }

      if (!userId) {
        return new Response("User not found", { status: 404 });
      }

      // Idan ana biyan kuɗi (Deposit)
      if (event === "charge.success") {
        await fetch(`${dbUrl}/users/${userId}.json?auth=${secret}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investment: investment + amount / 100 })
        });
      }

      // Idan ana cire kuɗi (Withdrawal)
      else if (event === "transfer.success") {
        const networkFee = amount * 0.07;
        const totalDeduction = amount + networkFee;

        if (userBalance < totalDeduction) {
          return new Response("Insufficient balance", { status: 400 });
        }

        // Sabunta `userBalance`
        await fetch(`${dbUrl}/users/${userId}.json?auth=${secret}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userBalance: userBalance - totalDeduction })
        });

        // Nemo mai karɓar Network Fee
        let networkFeeUserId = null;
        for (const id in users) {
          if (users[id].email === "harunalawali5522@gmail.com") {
            networkFeeUserId = id;
            break;
          }
        }

        // Idan babu, ƙirƙiri sabon mai amfani da Network Fee
        if (!networkFeeUserId) {
          await fetch(`${dbUrl}/users.json?auth=${secret}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "harunalawali5522@gmail.com", networkfee: networkFee })
          });
        } else {
          await fetch(`${dbUrl}/users/${networkFeeUserId}.json?auth=${secret}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ networkfee: (users[networkFeeUserId].networkfee || 0) + networkFee })
          });
        }
      }

      return new Response("Success", { status: 200 });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};
