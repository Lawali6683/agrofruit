addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const payload = await request.json();
        const firebaseData = await getFirebaseData();

        if (!firebaseData) {
            return new Response(JSON.stringify({ message: 'No withdrawals found' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let successCount = 0;
        let failureCount = 0;

        for (const uid in firebaseData) {
            if (firebaseData[uid].approvedWithdrawals) {
                const withdrawal = firebaseData[uid].approvedWithdrawals;
                const user = await getUserDetails(uid);

                if (user && user.paystackCustomerId) {
                    const withdrawalResponse = await performPaystackWithdrawal(withdrawal, user);

                    if (withdrawalResponse.success) {
                        await updateFirebase(uid, withdrawal, 'withdrawalSuccessful');
                        successCount++;
                    } else {
                        failureCount++;
                    }
                }
            }
        }

        return new Response(JSON.stringify({ 
            message: 'Withdrawals processed', 
            successful: successCount, 
            failed: failureCount 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error processing withdrawals:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function getFirebaseData() {
    const firebaseUrl = `${FIREBASE_DATABASE_URL}/users.json?auth=${FIREBASE_SECRET}`;
    const response = await fetch(firebaseUrl);

    if (!response.ok) throw new Error('Failed to fetch Firebase data');

    return response.json();
}

async function getUserDetails(uid) {
    const firebaseUrl = `${FIREBASE_DATABASE_URL}/users/${uid}.json?auth=${FIREBASE_SECRET}`;
    const response = await fetch(firebaseUrl);

    if (!response.ok) return null;

    return response.json();
}

async function performPaystackWithdrawal(withdrawal, user) {
    const reference = `withdrawal_${Date.now()}`;
    const requestBody = {
        type: "nuban",
        name: withdrawal.accountName,
        account_number: withdrawal.accountNumber,
        bank_code: withdrawal.bankCode,
        currency: "NGN"
    };

    const transferRecipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!transferRecipientResponse.ok) return { success: false };

    const recipientData = await transferRecipientResponse.json();
    const recipientCode = recipientData.data.recipient_code;

    const transferData = {
        source: "balance",
        amount: withdrawal.amount * 100, 
        recipient: recipientCode,
        reason: "Withdrawal from AgroFruit",
        reference: reference
    };

    const transferResponse = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(transferData)
    });

    if (!transferResponse.ok) return { success: false };

    const transferResult = await transferResponse.json();
    return transferResult.data.status === 'success' ? { success: true } : { success: false };
}

async function updateFirebase(uid, withdrawal, status) {
    const firebaseUrl = `${FIREBASE_DATABASE_URL}/users/${uid}/${status}.json?auth=${FIREBASE_SECRET}`;
    const response = await fetch(firebaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withdrawal)
    });

    if (!response.ok) throw new Error('Failed to update Firebase');

    // Delete old withdrawal entry
    const deleteUrl = `${FIREBASE_DATABASE_URL}/users/${uid}/approvedWithdrawals.json?auth=${FIREBASE_SECRET}`;
    await fetch(deleteUrl, { method: 'DELETE' });
}
