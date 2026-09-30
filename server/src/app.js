import express from 'express';
import pool from './db/pool.js';

const app = express();

app.get('/api/hello', (req,res) => {
    res.json({ message: 'Hello from the server'});
});

app.get('/api/ingredients', async (req, res) =>{
    const result = await pool.query('SELECT id, name FROM ingredients ORDER BY name');
    res.json(result.rows);
})

app.listen(3000, () =>{
    console.log('Listening on http://localhost:3000');
});


