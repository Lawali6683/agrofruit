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

                if (user && user.monnifyCustomerId) {
                    const withdrawalResponse = await performMonnifyWithdrawal(withdrawal, user);

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

async function performMonnifyWithdrawal(withdrawal, user) {
    const token = await getMonnifyToken();

    const withdrawalData = {
        reference: `withdrawal_${Date.now()}`,
        amount: withdrawal.amount,
        bankCode: withdrawal.bankCode,
        accountNumber: withdrawal.accountNumber,
        narration: 'Withdrawals from AgroFruit',
        currency: 'NGN',
        destinationAccountName: withdrawal.accountName,
        destinationBankCode: withdrawal.bankCode,
        destinationAccountNumber: withdrawal.accountNumber,
        customerEmail: user.email,
        customerName: withdrawal.accountName,
        customerPhone: user.phoneNumber,
        monnifyCustomerId: user.monnifyCustomerId
    };

    const response = await fetch('https://api.monnify.com/api/v2/transactions/initiate', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(withdrawalData)
    });

    if (!response.ok) return { success: false };

    const result = await response.json();
    return result.responseBody ? { success: true } : { success: false };
}

async function getMonnifyToken() {
    const authToken = btoa(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`);
    const response = await fetch('https://api.monnify.com/api/v1/auth/login', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) throw new Error('Failed to get Monnify token');

    const data = await response.json();
    return data.responseBody.accessToken;
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
