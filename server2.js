const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const PORT = process.env.PORT || 3000;
const YOUR_USDT_WALLET = process.env.USDT_WALLET || "TВашАдресКошелька";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Хранилище платежей (в памяти)
const payments = new Map();

// ============================================
// ГЛАВНАЯ СТРАНИЦА (обязательно!)
// ============================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Платежный шлюз</title>
            <style>
                body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                input, button { padding: 12px; margin: 10px 0; width: 100%; border-radius: 8px; border: 1px solid #ddd; }
                button { background: #28a745; color: white; border: none; cursor: pointer; }
                .qr { margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🏪 Платежный шлюз</h1>
                <form id="form">
                    <input type="number" id="amount" placeholder="Сумма в рублях" required>
                    <input type="text" id="product" placeholder="Товар" value="Товар">
                    <button type="submit">Создать ссылку для оплаты</button>
                </form>
                <div id="result" style="margin-top: 20px;"></div>
            </div>
            <script>
                document.getElementById('form').onsubmit = async (e) => {
                    e.preventDefault();
                    const amount = document.getElementById('amount').value;
                    const product = document.getElementById('product').value;
                    const response = await fetch('/api/create-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount_rub: amount, product_name: product })
                    });
                    const data = await response.json();
                    if (data.success) {
                        document.getElementById('result').innerHTML = \`
                            <h3>✅ Готово!</h3>
                            <p>Сумма: \${data.amount_usdt} USDT</p>
                            <p>Кошелек: ${YOUR_USDT_WALLET}</p>
                            <div class="qr"><img src="\${data.qr_code}" style="max-width:200px"></div>
                            <p><a href="\${data.payment_url}" target="_blank">Ссылка для оплаты</a></p>
                        \`;
                    } else {
                        alert('Ошибка: ' + data.error);
                    }
                };
            </script>
        </body>
        </html>
    `);
});

// ============================================
// API: СОЗДАНИЕ ПЛАТЕЖА
// ============================================
app.post('/api/create-payment', async (req, res) => {
    try {
        const { amount_rub, product_name } = req.body;
        
        if (!amount_rub || amount_rub < 10) {
            return res.status(400).json({ error: "Минимальная сумма 10 рублей" });
        }
        
        const payment_id = crypto.randomBytes(16).toString('hex');
        const rate = 92.5; // фиксированный курс для теста
        const amount_usdt = (amount_rub / rate).toFixed(2);
        
        const payment = {
            payment_id,
            amount_rub: parseFloat(amount_rub),
            amount_usdt: parseFloat(amount_usdt),
            product: product_name || "Товар",
            wallet_address: YOUR_USDT_WALLET,
            status: 'pending',
            created_at: Date.now()
        };
        
        payments.set(payment_id, payment);
        
        const payment_url = `${BASE_URL}/pay/${payment_id}`;
        const qr_code = await QRCode.toDataURL(payment_url);
        
        res.json({
            success: true,
            payment_id,
            payment_url,
            qr_code,
            amount_usdt,
            wallet_address: YOUR_USDT_WALLET
        });
        
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// СТРАНИЦА ОПЛАТЫ
// ============================================
app.get('/pay/:payment_id', (req, res) => {
    const payment = payments.get(req.params.payment_id);
    
    if (!payment) {
        return res.status(404).send('<h1>❌ Платеж не найден</h1>');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Оплата</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>💳 Оплатите заказ</h1>
            <p>${payment.product}</p>
            <h2>${payment.amount_usdt} USDT</h2>
            <p>Отправьте на кошелек:</p>
            <p style="background:#f0f0f0; padding:10px; word-break:break-all;">${payment.wallet_address}</p>
            <button onclick="copyAddress()">📋 Копировать адрес</button>
            <script>
                function copyAddress() {
                    navigator.clipboard.writeText('${payment.wallet_address}');
                    alert('Адрес скопирован!');
                }
            </script>
        </body>
        </html>
    `);
});

// ============================================
// ЗАПУСК (ВАЖНО: слушаем на 0.0.0.0)
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Открыть: http://localhost:${PORT}`);
});
