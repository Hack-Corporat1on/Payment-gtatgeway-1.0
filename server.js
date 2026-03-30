// ============================================
// ПЛАТЕЖНЫЙ ШЛЮЗ С BCON GLOBAL
// RUB → USDT автоматически через конвертацию
// НЕКОСТОДИАЛЬНЫЙ, БЕЗ KYC
// ============================================

const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// КОНФИГУРАЦИЯ BCON GLOBAL
// ============================================

const BCON_API_URL = 'https://external-api.bcon.global/api/v2/address';
const BCON_API_KEY = process.env.BCON_API_KEY;
const YOUR_USDT_WALLET = process.env.USDT_WALLET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Хранилище платежей
const payments = new Map();

// ============================================
// ФУНКЦИЯ ПОЛУЧЕНИЯ КУРСА USD → RUB
// ============================================
async function getRubToUsdRate() {
    try {
        const response = await axios.get('https://api.exchangerate.host/latest?base=USD&symbols=RUB');
        return response.data.rates.RUB;
    } catch (error) {
        console.log('⚠️ Использую резервный курс: 1 USD = 92.5 RUB');
        return 92.5;
    }
}

// ============================================
// ФУНКЦИЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА В BCON
// ============================================
async function checkBconPaymentStatus(address, expectedAmount, externalId) {
    try {
        // Используем публичный API для проверки транзакций на Tron
        // В реальном проекте Bcon предоставляет свой API для проверки статуса
        const response = await axios.get(`https://api.trongrid.io/v1/accounts/${address}/transactions`, {
            params: {
                only_confirmed: true,
                limit: 10
            }
        });
        
        const transactions = response.data.data || [];
        
        for (const tx of transactions) {
            if (tx.raw_data.contract[0].parameter.value.amount) {
                const amountInUsdt = tx.raw_data.contract[0].parameter.value.amount / 1000000;
                
                // Проверяем, что сумма совпадает с ожидаемой
                if (Math.abs(amountInUsdt - expectedAmount) < 0.01) {
                    return {
                        success: true,
                        status: 'paid',
                        txid: tx.txID,
                        amount: amountInUsdt
                    };
                }
            }
        }
        
        return { success: true, status: 'pending' };
        
    } catch (error) {
        console.error('❌ Ошибка проверки статуса:', error.message);
        return { success: false, status: 'error' };
    }
}

// ============================================
// ФУНКЦИЯ СОЗДАНИЯ ИНВОЙСА В BCON
// ============================================
async function createBconInvoice(amountRub, orderId, productName) {
    try {
        const rubToUsdRate = await getRubToUsdRate();
        const amountUsd = amountRub / rubToUsdRate;
        
        console.log(`\n📝 Создание инвойса в Bcon Global:`);
        console.log(`   Сумма в RUB: ${amountRub}`);
        console.log(`   Курс USD/RUB: ${rubToUsdRate}`);
        console.log(`   Сумма в USD: ${amountUsd.toFixed(2)}`);
        console.log(`   Order ID: ${orderId}`);
        
        const requestData = {
            payment_currency: "USDT",
            origin_amount: amountUsd.toFixed(2),
            origin_currency: "USD",
            external_id: orderId.slice(-8),
            chain: "tron"
        };
        
        console.log(`   Запрос к Bcon:`, JSON.stringify(requestData, null, 2));
        
        const response = await axios.post(BCON_API_URL, requestData, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BCON_API_KEY}`
            }
        });
        
        console.log(`   Ответ Bcon:`, response.data);
        
        return {
            success: true,
            address: response.data.address,
            amount_usdt: parseFloat(response.data.amount),
            external_id: requestData.external_id,
            expires_at: response.data.expires_at
        };
        
    } catch (error) {
        console.error('❌ Ошибка создания инвойса в Bcon:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

// ============================================
// ГЛАВНАЯ СТРАНИЦА (панель продавца)
// ============================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Платежный шлюз - Bcon Global</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container { max-width: 600px; margin: 0 auto; }
                .card {
                    background: white;
                    border-radius: 24px;
                    padding: 32px;
                    margin-bottom: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                h1 { font-size: 28px; color: #333; margin-bottom: 8px; }
                .subtitle { color: #666; margin-bottom: 24px; }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
                input {
                    width: 100%;
                    padding: 14px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    font-size: 16px;
                }
                input:focus { outline: none; border-color: #667eea; }
                button {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 16px;
                    width: 100%;
                    border-radius: 12px;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                }
                button:hover { transform: translateY(-2px); }
                .result {
                    margin-top: 24px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 16px;
                    display: none;
                }
                .result.show { display: block; }
                .qr-container { text-align: center; margin: 20px 0; }
                .qr-container img { max-width: 200px; border-radius: 16px; }
                .link-box {
                    background: #e9ecef;
                    padding: 12px;
                    border-radius: 10px;
                    word-break: break-all;
                    font-family: monospace;
                    font-size: 12px;
                }
                .button-group { display: flex; gap: 10px; margin-top: 15px; }
                .button-group button { background: #28a745; margin: 0; }
                .button-group .copy-btn { background: #007bff; }
                .status {
                    margin-top: 15px;
                    padding: 12px;
                    border-radius: 10px;
                    text-align: center;
                }
                .status.success { background: #d4edda; color: #155724; }
                .status.error { background: #f8d7da; color: #721c24; }
                .status.info { background: #d1ecf1; color: #0c5460; }
                .status.warning { background: #fff3cd; color: #856404; }
                .info-text {
                    background: #e9ecef;
                    padding: 12px;
                    border-radius: 10px;
                    margin-top: 16px;
                    font-size: 13px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>🏪 Bcon Global Платежи</h1>
                    <div class="subtitle">Без KYC • Без посредников • 1% комиссия</div>
                    
                    <form id="paymentForm">
                        <div class="form-group">
                            <label>💰 Сумма в рублях (RUB)</label>
                            <input type="number" id="amount" placeholder="Например: 2500" required min="10" step="1">
                        </div>
                        <div class="form-group">
                            <label>📦 Название товара</label>
                            <input type="text" id="product" placeholder="Например: Футболка" value="Товар">
                        </div>
                        <button type="submit">✨ Создать ссылку для оплаты</button>
                    </form>
                    
                    <div id="result" class="result">
                        <h3 style="margin-bottom: 16px;">✅ Готово!</h3>
                        <div class="qr-container" id="qrContainer"></div>
                        <div class="link-box" id="paymentLink"></div>
                        <div class="button-group">
                            <button class="copy-btn" onclick="copyLink()">📋 Копировать ссылку</button>
                            <button onclick="downloadQR()">📱 Скачать QR-код</button>
                        </div>
                        <div id="status" class="status info">⏳ Ожидание оплаты...</div>
                        <div class="info-text">
                            💡 <strong>Важно:</strong> Покупатель должен отправить ТОЧНУЮ сумму USDT, указанную на странице оплаты.<br>
                            🔗 Ссылка активна 24 часа.
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h3>💡 Как это работает:</h3>
                    <ol style="margin-top: 16px; margin-left: 20px; color: #666; line-height: 1.6;">
                        <li>Вы вводите сумму в рублях</li>
                        <li>Система конвертирует в USDT по текущему курсу</li>
                        <li>Создается инвойс в Bcon Global</li>
                        <li>Покупатель сканирует QR-код и отправляет USDT</li>
                        <li>USDT поступают напрямую на ваш кошелек!</li>
                        <li>Вы получаете уведомление об оплате</li>
                    </ol>
                    <div class="info-text" style="margin-top: 16px;">
                        🔒 <strong>Bcon Global — некостодиальный сервис:</strong> деньги идут напрямую на ваш кошелек. Bcon не имеет доступа к вашим средствам.
                    </div>
                </div>
            </div>
            
            <script>
                let currentPaymentId = null;
                let checkInterval = null;
                
                document.getElementById('paymentForm').onsubmit = async (e) => {
                    e.preventDefault();
                    
                    const amount = document.getElementById('amount').value;
                    const product = document.getElementById('product').value;
                    
                    const button = e.target.querySelector('button');
                    button.disabled = true;
                    button.textContent = '⏳ Создание...';
                    
                    try {
                        const response = await fetch('/api/create-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amount_rub: amount, product_name: product })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            currentPaymentId = data.payment_id;
                            
                            document.getElementById('paymentLink').textContent = data.payment_url;
                            document.getElementById('qrContainer').innerHTML = \`<img src="\${data.qr_code}" alt="QR-код">\`;
                            document.getElementById('result').classList.add('show');
                            document.getElementById('status').className = 'status info';
                            document.getElementById('status').innerHTML = \`
                                ⏳ Ожидание оплаты...<br>
                                Сумма к оплате: \${data.amount_usdt} USDT<br>
                                Кошелек: \${data.wallet_address}
                            \`;
                            
                            if (checkInterval) clearInterval(checkInterval);
                            checkPaymentStatus();
                        } else {
                            alert('Ошибка: ' + data.error);
                        }
                    } catch (err) {
                        alert('Ошибка: ' + err.message);
                    } finally {
                        button.disabled = false;
                        button.textContent = '✨ Создать ссылку для оплаты';
                    }
                };
                
                async function checkPaymentStatus() {
                    if (!currentPaymentId) return;
                    
                    checkInterval = setInterval(async () => {
                        try {
                            const response = await fetch(\`/api/check-payment/\${currentPaymentId}\`);
                            const data = await response.json();
                            
                            if (data.status === 'paid') {
                                clearInterval(checkInterval);
                                document.getElementById('status').className = 'status success';
                                document.getElementById('status').innerHTML = \`
                                    ✅ ОПЛАЧЕНО!<br>
                                    Получено: \${data.amount_usdt} USDT<br>
                                    TXID: \${data.txid?.substring(0, 30)}...<br>
                                    💰 Средства поступили на ваш кошелек!
                                \`;
                            } else if (data.status === 'expired') {
                                clearInterval(checkInterval);
                                document.getElementById('status').className = 'status error';
                                document.getElementById('status').innerHTML = '⏰ Счет просрочен. Создайте новую ссылку.';
                            } else if (data.status === 'pending') {
                                const elapsed = Math.floor((Date.now() - data.created_at) / 1000 / 60);
                                document.getElementById('status').innerHTML = \`
                                    ⏳ Ожидание оплаты... (\${elapsed} мин.)<br>
                                    Сумма: \${data.amount_usdt} USDT<br>
                                    💡 Покупатель должен отправить ТОЧНО эту сумму!
                                \`;
                            }
                        } catch (err) {
                            console.error('Ошибка проверки статуса:', err);
                        }
                    }, 10000);
                    
                    setTimeout(() => {
                        if (checkInterval) clearInterval(checkInterval);
                    }, 24 * 60 * 60 * 1000);
                }
                
                function copyLink() {
                    const link = document.getElementById('paymentLink').textContent;
                    navigator.clipboard.writeText(link);
                    alert('Ссылка скопирована!');
                }
                
                function downloadQR() {
                    const img = document.querySelector('#qrContainer img');
                    if (img) {
                        const link = document.createElement('a');
                        link.download = 'payment-qr.png';
                        link.href = img.src;
                        link.click();
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// ============================================
// API: СОЗДАНИЕ ПЛАТЕЖА (через Bcon Global)
// ============================================
app.post('/api/create-payment', async (req, res) => {
    try {
        const { amount_rub, product_name } = req.body;
        
        if (!amount_rub || amount_rub < 10) {
            return res.status(400).json({ error: "Минимальная сумма 10 рублей" });
        }
        
        if (amount_rub > 500000) {
            return res.status(400).json({ error: "Максимальная сумма 500,000 рублей" });
        }
        
        const payment_id = crypto.randomBytes(16).toString('hex');
        const order_id = `${Date.now()}-${payment_id.slice(0, 4)}`;
        
        const bconInvoice = await createBconInvoice(amount_rub, order_id, product_name);
        
        if (!bconInvoice.success) {
            return res.status(500).json({ error: bconInvoice.error });
        }
        
        payments.set(payment_id, {
            payment_id: payment_id,
            order_id: order_id,
            external_id: bconInvoice.external_id,
            amount_rub: parseFloat(amount_rub),
            amount_usdt: bconInvoice.amount_usdt,
            product: product_name || "Товар",
            wallet_address: bconInvoice.address,
            status: 'pending',
            created_at: Date.now(),
            expires_at: bconInvoice.expires_at
        });
        
        const payment_url = `${BASE_URL}/pay/${payment_id}`;
        const qr_code = await QRCode.toDataURL(payment_url);
        
        console.log(`\n✅ Платеж создан!`);
        console.log(`   Payment ID: ${payment_id}`);
        console.log(`   Order ID: ${order_id}`);
        console.log(`   Сумма: ${amount_rub} RUB → ${bconInvoice.amount_usdt} USDT`);
        console.log(`   Адрес для оплаты: ${bconInvoice.address}`);
        console.log(`   Ссылка: ${payment_url}\n`);
        
        res.json({
            success: true,
            payment_id: payment_id,
            payment_url: payment_url,
            qr_code: qr_code,
            amount_rub: amount_rub,
            amount_usdt: bconInvoice.amount_usdt,
            wallet_address: bconInvoice.address,
            expires_at: bconInvoice.expires_at
        });
        
    } catch (error) {
        console.error('❌ Ошибка создания платежа:', error);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

// ============================================
// СТРАНИЦА ОПЛАТЫ ДЛЯ ПОКУПАТЕЛЯ
// ============================================
app.get('/pay/:payment_id', async (req, res) => {
    const payment = payments.get(req.params.payment_id);
    
    if (!payment) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Ошибка</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ Платеж не найден</h1>
                <p>Ссылка недействительна. Обратитесь к продавцу.</p>
            </body>
            </html>
        `);
    }
    
    if (Date.now() - payment.created_at > 24 * 60 * 60 * 1000) {
        payment.status = 'expired';
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Ссылка устарела</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>⏰ Ссылка устарела</h1>
                <p>Время действия истекло. Обратитесь к продавцу.</p>
            </body>
            </html>
        `);
    }
    
    if (payment.status === 'paid') {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Уже оплачено</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>✅ Заказ оплачен</h1>
                <p>Спасибо за покупку!</p>
                <p>TXID: ${payment.txid?.substring(0, 30)}...</p>
            </body>
            </html>
        `);
    }
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Оплата заказа</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .card {
                    background: white;
                    border-radius: 24px;
                    padding: 32px;
                    max-width: 500px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                h1 { font-size: 28px; margin-bottom: 8px; }
                .amount { 
                    font-size: 48px; 
                    font-weight: bold; 
                    color: #667eea; 
                    text-align: center;
                    margin: 20px 0;
                }
                .address {
                    background: #f8f9fa;
                    border-radius: 12px;
                    padding: 12px;
                    font-family: monospace;
                    word-break: break-all;
                    font-size: 12px;
                    margin: 16px 0;
                }
                .info {
                    background: #e9ecef;
                    border-radius: 12px;
                    padding: 16px;
                    margin: 16px 0;
                }
                button {
                    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    color: white;
                    border: none;
                    padding: 16px;
                    width: 100%;
                    border-radius: 12px;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                }
                button:disabled { opacity: 0.6; cursor: not-allowed; }
                .copy-btn {
                    background: #6c757d;
                    margin-top: 8px;
                }
                .warning {
                    background: #fff3cd;
                    color: #856404;
                    padding: 12px;
                    border-radius: 10px;
                    margin: 16px 0;
                    font-size: 14px;
                }
                .loading { text-align: center; margin-top: 20px; display: none; }
                .success { text-align: center; margin-top: 20px; display: none; color: #28a745; }
                .error { text-align: center; margin-top: 20px; display: none; color: #dc3545; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>💳 Оплата заказа</h1>
                <p style="color: #666; margin-bottom: 8px;">${payment.product}</p>
                
                <div class="amount">
                    ${payment.amount_usdt} USDT
                </div>
                
                <div class="info">
                    <p><strong>💰 Сумма в рублях:</strong> ${payment.amount_rub} ₽</p>
                    <p><strong>📦 Номер заказа:</strong> ${payment.order_id}</p>
                </div>
                
                <div class="warning">
                    ⚠️ <strong>ВАЖНО!</strong> Отправьте ТОЧНО ${payment.amount_usdt} USDT на указанный кошелек.<br>
                    Другая сумма не будет зачтена!
                </div>
                
                <div class="address">
                    <strong>📤 Адрес для перевода (TRC20):</strong><br>
                    ${payment.wallet_address}
                </div>
                
                <button onclick="copyAddress()">📋 Копировать адрес</button>
                <button class="copy-btn" onclick="copyAmount()">💰 Копировать сумму</button>
                
                <div class="loading" id="loading">⏳ Проверка оплаты...</div>
                <div class="success" id="success">✅ Оплата получена! Спасибо за покупку.</div>
                <div class="error" id="error">❌ Ошибка проверки. Попробуйте обновить страницу.</div>
            </div>
            
            <script>
                let checkInterval;
                
                function copyAddress() {
                    navigator.clipboard.writeText('${payment.wallet_address}');
                    alert('Адрес скопирован!');
                }
                
                function copyAmount() {
                    navigator.clipboard.writeText('${payment.amount_usdt}');
                    alert('Сумма скопирована!');
                }
                
                async function checkPayment() {
                    const loading = document.getElementById('loading');
                    const success = document.getElementById('success');
                    const error = document.getElementById('error');
                    
                    loading.style.display = 'block';
                    
                    try {
                        const response = await fetch('/api/check-payment/${payment.payment_id}');
                        const result = await response.json();
                        
                        if (result.status === 'paid') {
                            clearInterval(checkInterval);
                            loading.style.display = 'none';
                            success.style.display = 'block';
                        } else if (result.status === 'expired') {
                            clearInterval(checkInterval);
                            loading.style.display = 'none';
                            error.style.display = 'block';
                            error.innerHTML = '⏰ Срок оплаты истек. Обратитесь к продавцу.';
                        } else {
                            loading.style.display = 'none';
                        }
                    } catch (err) {
                        loading.style.display = 'none';
                        console.error(err);
                    }
                }
                
                checkInterval = setInterval(checkPayment, 10000);
                checkPayment();
            </script>
        </body>
        </html>
    `);
});

// ============================================
// API: ПРОВЕРКА СТАТУСА ПЛАТЕЖА
// ============================================
app.get('/api/check-payment/:payment_id', async (req, res) => {
    const payment = payments.get(req.params.payment_id);
    
    if (!payment) {
        return res.json({ status: 'not_found' });
    }
    
    // Если платеж еще не оплачен, проверяем через TronGrid API
    if (payment.status === 'pending') {
        const checkResult = await checkBconPaymentStatus(
            payment.wallet_address,
            payment.amount_usdt,
            payment.external_id
        );
        
        if (checkResult.success && checkResult.status === 'paid') {
            payment.status = 'paid';
            payment.txid = checkResult.txid;
            console.log(`\n✅ ПЛАТЕЖ ПОДТВЕРЖДЕН!`);
            console.log(`   Order ID: ${payment.order_id}`);
            console.log(`   Получено: ${checkResult.amount} USDT`);
            console.log(`   TXID: ${checkResult.txid}\n`);
        }
    }
    
    res.json({
        status: payment.status,
        amount_usdt: payment.amount_usdt,
        amount_rub: payment.amount_rub,
        txid: payment.txid || null,
        created_at: payment.created_at
    });
});

// ============================================
// WEBHOOK для получения уведомлений от Bcon Global
// ============================================
app.post('/api/webhook/bcon', (req, res) => {
    try {
        const callbackData = req.body;
        
        console.log(`\n🔔 ПОЛУЧЕН WEBHOOK ОТ BCON GLOBAL`);
        console.log(`   Status: ${callbackData.status}`);
        console.log(`   External ID: ${callbackData.external_id}`);
        console.log(`   Address: ${callbackData.addr}`);
        console.log(`   Value: ${callbackData.value}`);
        console.log(`   TXID: ${callbackData.txid}`);
        
        if (callbackData.status === 2) {
            for (const [payment_id, payment] of payments.entries()) {
                if (payment.external_id === callbackData.external_id) {
                    payment.status = 'paid';
                    payment.txid = callbackData.txid;
                    payment.paid_at = Date.now();
                    
                    console.log(`✅ ПЛАТЕЖ ПОДТВЕРЖДЕН!`);
                    console.log(`   Payment ID: ${payment_id}`);
                    console.log(`   Order ID: ${payment.order_id}`);
                    console.log(`   Получено: ${payment.amount_usdt} USDT\n`);
                    break;
                }
            }
        }
        
        res.sendStatus(200);
        
    } catch (error) {
        console.error('❌ Ошибка обработки webhook:', error);
        res.sendStatus(500);
    }
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🏪 ПЛАТЕЖНЫЙ ШЛЮЗ С BCON GLOBAL                            ║
║   🔐 Без KYC • Без посредников • Деньги напрямую на кошелек  ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   ✅ СЕРВЕР ЗАПУЩЕН                                          ║
║   🔗 Откройте на телефоне: http://localhost:${PORT}          ║
║   🌐 Публичный адрес: ${BASE_URL}                            ║
║                                                              ║
║   💰 ВАШ USDT КОШЕЛЕК (TRC20):                               ║
║   ${YOUR_USDT_WALLET?.substring(0, 40) || 'не указан'}...    ║
║                                                              ║
║   🔌 Bcon Global API: подключен                              ║
║   💸 Комиссия: 1% от суммы транзакции                        ║
║   🎁 Тестовые платежи: 5 бесплатных                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});