const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const secret = process.env.secret;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});

db.connect((err) => {
    if (err) {
        console.error('Erro ao conectar no MySQL:', err);
        return;
    }
    console.log('Conectado ao MySQL');
});

const criarTabelas = () => {
    const usuarios = `CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE,
        email VARCHAR(320) UNIQUE,
        password VARCHAR(255)
    )`;

    const gastos = `CREATE TABLE IF NOT EXISTS gastos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT,
        descricao VARCHAR(255),
        valor DECIMAL(10,2),
        valor_pago DECIMAL(10,2) DEFAULT 0,
        status ENUM('pendente', 'pago', 'parcialmente pago') DEFAULT 'pendente',
        vencimento DATE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )`;

    const limites_gastos = `CREATE TABLE IF NOT EXISTS limites_gastos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT,
        mes INT,
        ano INT,
        limite DECIMAL(10,2),
        UNIQUE KEY unique_limite (usuario_id, mes, ano),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )`;

    db.query(usuarios, (err) => {
        if (err) console.error('Erro ao criar tabela usuarios:', err);
        else console.log('Tabela usuarios verificada/criada.');
    });
    db.query(gastos, (err) => {
        if (err) console.error('Erro ao criar tabela gastos:', err);
        else console.log('Tabela gastos verificada/criada.');
    });
    db.query(limites_gastos, (err) => {
        if (err) console.error('Erro ao criar tabela limites_gastos:', err);
        else console.log('Tabela limites_gastos verificada/criada.');
    });
};

criarTabelas();

// Função de autenticação de token com logs para depuração
const autenticarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        console.log('Erro de Autenticação: Token não fornecido.');
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    jwt.verify(token, secret, (err, user) => {
        if (err) {
            console.log('Erro de Autenticação: Token inválido.', err.message);
            return res.status(403).json({ error: 'Token inválido' });
        }
        console.log('Autenticação bem-sucedida para o usuário:', user.id);
        req.user = user;
        next();
    });
};

app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        db.query('INSERT INTO usuarios (username, email, password) VALUES (?, ?, ?)',
            [name, email, hash],
            (err) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ error: 'Email ou nome de usuário já existe.' });
                    }
                    return res.status(500).json({ error: 'Erro no cadastro. Tente novamente.' });
                }
                res.json({ message: 'Usuário registrado com sucesso!' });
            });
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
    }

    const queryParams = [username, username];
    db.query('SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)', queryParams, async (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ error: 'Usuário não encontrado ou senha incorreta.' });
        }
        const user = results[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Usuário não encontrado ou senha incorreta.' });
        }
        const token = jwt.sign({ id: user.id }, secret, { expiresIn: '1d' });
        res.json({ token });
    });
});

app.get('/gastos', autenticarToken, (req, res) => {
    db.query('SELECT * FROM gastos WHERE usuario_id = ? ORDER BY vencimento DESC', [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar gastos' });
        res.json(results);
    });
});

// NOVO: Rota para POST de gastos com suporte a parcelas
app.post('/gastos', autenticarToken, async (req, res) => {
    const { descricao, valor, dia, mes, ano, parcelas = 1 } = req.body;
    const userId = req.user.id;

    if (!descricao || isNaN(valor) || valor <= 0 || isNaN(dia) || isNaN(mes) || isNaN(ano)) {
        return res.status(400).json({ error: 'Por favor, forneça uma descrição, valor e vencimento válidos.' });
    }

    try {
        const valorPorParcela = valor / parcelas;
        const insertPromises = [];
        const dataVencimento = new Date(ano, mes - 1, dia);

        for (let i = 0; i < parcelas; i++) {
            const dataParcela = new Date(dataVencimento);
            dataParcela.setMonth(dataParcela.getMonth() + i);

            // Formata a data para 'YYYY-MM-DD'
            const vencimentoFormatado = dataParcela.toISOString().split('T')[0];

            insertPromises.push(new Promise((resolve, reject) => {
                db.query(
                    'INSERT INTO gastos (usuario_id, descricao, valor, vencimento) VALUES (?, ?, ?, ?)',
                    [userId, descricao + (parcelas > 1 ? ` (${i + 1}/${parcelas})` : ''), valorPorParcela, vencimentoFormatado],
                    (err, result) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(result);
                    }
                );
            }));
        }

        await Promise.all(insertPromises);

        res.status(201).json({ message: `${parcelas > 1 ? 'Parcelas' : 'Gasto'} adicionadas com sucesso!` });

    } catch (error) {
        console.error('Erro ao adicionar gasto(s) parcelado(s):', error);
        return res.status(500).json({ error: 'Erro ao adicionar o(s) gasto(s). Tente novamente.' });
    }
});

app.put('/gastos/pagar/:id', autenticarToken, (req, res) => {
    const { id } = req.params;
    const { valor_pagamento } = req.body;

    if (isNaN(valor_pagamento) || valor_pagamento <= 0) {
        return res.status(400).json({ error: 'O valor do pagamento deve ser um número positivo.' });
    }

    db.query('SELECT valor, valor_pago FROM gastos WHERE id = ? AND usuario_id = ?', [id, req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar gasto.' });
        if (results.length === 0) return res.status(404).json({ error: 'Gasto não encontrado ou não pertence ao usuário.' });

        const gasto = results[0];
        const saldoRestante = gasto.valor - gasto.valor_pago;

        if (valor_pagamento > saldoRestante) {
            return res.status(400).json({ error: `O valor do pagamento excede o saldo restante de R$ ${saldoRestante.toFixed(2)}.` });
        }

        const novoValorPago = parseFloat(gasto.valor_pago) + parseFloat(valor_pagamento);
        let novoStatus = 'parcialmente pago';
        if (novoValorPago >= gasto.valor) {
            novoStatus = 'pago';
        }

        db.query('UPDATE gastos SET valor_pago = ?, status = ? WHERE id = ?', [novoValorPago, novoStatus, id], (err) => {
            if (err) return res.status(500).json({ error: 'Erro ao registrar pagamento.' });
            res.json({ message: 'Pagamento registrado com sucesso.', status: novoStatus, valor_pago: novoValorPago });
        });
    });
});

app.put('/gastos/:id', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    const { descricao, valor, vencimento } = req.body;
    const userId = req.user.id;

    if (!descricao || isNaN(valor) || valor <= 0 || !vencimento) {
        return res.status(400).json({ error: 'Dados inválidos para a atualização do gasto.' });
    }

    const updateQuery = 'UPDATE gastos SET descricao = ?, valor = ?, vencimento = ? WHERE id = ? AND usuario_id = ?';
    db.query(updateQuery, [descricao, valor, vencimento, id, userId], (err, result) => {
        if (err) {
            console.error('Erro ao editar gasto:', err);
            return res.status(500).json({ error: 'Erro ao editar o gasto. Tente novamente.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Gasto não encontrado ou não pertence a este usuário.' });
        }

        res.status(200).json({ message: 'Gasto editado com sucesso.' });
    });
});

app.delete('/gastos/:id', autenticarToken, (req, res) => {
    const gastoId = parseInt(req.params.id);
    const userId = req.user.id;

    db.query('DELETE FROM gastos WHERE id = ? AND usuario_id = ?', [gastoId, userId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao deletar o gasto.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Gasto não encontrado ou não pertence a este usuário.' });
        }
        res.json({ message: 'Gasto deletado com sucesso.' });
    });
});

app.post('/limite-gastos', autenticarToken, (req, res) => {
    const { limite, mes, ano } = req.body;
    const userId = req.user.id;

    if (isNaN(limite) || limite < 0 || !mes || !ano) {
        return res.status(400).json({ error: 'Dados inválidos para o limite.' });
    }

    const query = 'INSERT INTO limites_gastos (usuario_id, mes, ano, limite) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE limite = ?';
    db.query(query, [userId, mes, ano, limite, limite], (err, result) => {
        if (err) {
            console.error('Erro ao salvar o limite:', err);
            return res.status(500).json({ error: 'Erro ao salvar o limite de gastos.' });
        }
        res.status(200).json({ message: 'Limite de gastos salvo com sucesso.' });
    });
});

app.get('/limite-gastos', autenticarToken, (req, res) => {
    const { mes, ano } = req.query;
    const userId = req.user.id;

    if (!mes || !ano) {
        return res.status(400).json({ error: 'Por favor, forneça o mês e o ano.' });
    }

    const query = 'SELECT limite FROM limites_gastos WHERE usuario_id = ? AND mes = ? AND ano = ?';
    db.query(query, [userId, mes, ano], (err, result) => {
        if (err) {
            console.error('Erro ao buscar o limite:', err);
            return res.status(500).json({ error: 'Erro ao buscar o limite de gastos.' });
        }
        if (result.length === 0) {
            return res.status(404).json({ error: 'Limite não encontrado para este mês.' });
        }
        res.status(200).json(result[0]);
    });
});

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
