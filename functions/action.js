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
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function getFirebaseData() {
    const response = await fetch(`${FIREBASE_DATABASE_URL}/users.json?auth=${FIREBASE_SECRET}`);
    if (!response.ok) return null;
    return response.json();
}

async function getUserDetails(uid) {
    const response = await fetch(`${FIREBASE_DATABASE_URL}/users/${uid}.json?auth=${FIREBASE_SECRET}`);
    if (!response.ok) return null;
    return response.json();
}

async function performPaystackWithdrawal(withdrawal, user) {
    const reference = `withdrawal_${Date.now()}`;
    
    const transferRecipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: "nuban",
            name: withdrawal.accountName,
            account_number: withdrawal.accountNumber,
            bank_code: withdrawal.bankCode,
            currency: "NGN"
        })
    });

    if (!transferRecipientResponse.ok) return { success: false };
    
    const recipientData = await transferRecipientResponse.json();
    if (!recipientData.data || !recipientData.data.recipient_code) return { success: false };
    
    const recipientCode = recipientData.data.recipient_code;

    const transferResponse = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            source: "balance",
            amount: withdrawal.amount * 100,
            recipient: recipientCode,
            reason: "Withdrawal from AgroFruit",
            reference: reference
        })
    });

    if (!transferResponse.ok) return { success: false };
    
    const transferResult = await transferResponse.json();
    return transferResult.data && transferResult.data.status === 'success' ? { success: true } : { success: false };
}

async function updateFirebase(uid, withdrawal, status) {
    await fetch(`${FIREBASE_DATABASE_URL}/users/${uid}/${status}.json?auth=${FIREBASE_SECRET}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withdrawal)
    });

    await fetch(`${FIREBASE_DATABASE_URL}/users/${uid}/approvedWithdrawals.json?auth=${FIREBASE_SECRET}`, { method: 'DELETE' });
}
