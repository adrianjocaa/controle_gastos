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
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
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
            return res
