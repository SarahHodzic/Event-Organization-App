var express = require('express');
var router = express.Router();
const pg = require('pg');
const bcrypt = require('bcrypt');
const moment = require('moment');
const saltRounds = 10;

const dotenv = require('dotenv');
// Load environment variables
dotenv.config();

const config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    max: 100,
    idleTimeoutMillis: 3000,
}

const pool = new pg.Pool(config);

//hashing a password
const getHashedPassword = async (plainPassword) => {
    return new Promise((resolve, reject)=> {
        bcrypt.genSalt(saltRounds, function(err, salt) {
            if(err)
                reject(err)
            bcrypt.hash(plainPassword, salt, function(err, hash) {
                if(err)
                    reject(err)
                else{
                    resolve(hash)
                }
            });
        });
    })
}

/* GET users listing. */
router.get('/', async function(req, res, next) {
    console.log(req.session);
    console.log(req.session.userId);
    const flashMessages=req.flash('error')[0];
    res.render('login', { title: 'Login' ,flashMessages});
});

router.post('/login_validation', async function(req, res, next) {
    const data = req.body;
    console.log(data.password);
    const hashedPassword = await getHashedPassword(data.password);
    console.log(hashedPassword);
    pool.connect((err,client,done)=>{
        if(err)
            return res.send('prije baze greskica ' + err);
        client.query(`select * from users where email = $1`, [data.email], async (err,result)=>{
            done();
            if(err)
                return res.send('nakon logina greskica' + err);

            if(result.rows.length < 1){
                req.flash('error', 'Password and/or email incorrect. Please try again');
                return  res.redirect('/login');
            }


            console.log(result.rows);
            const user = {
                id : result.rows[0].id,
                user_type : result.rows[0].user_type_id,
                name: result.rows[0].name,
                surname: result.rows[0].surname
            }

            console.log(user);
            console.log(result.rows[0]);
            bcrypt.compare(data.password, result.rows[0].password, function (err, results) {
                if (err) {
                    console.error('Error while comparing passwords:', err);
                    return res.send(err);
                }
                req.session.userId = user.id;
                req.session.userType = user.user_type;
                req.session.name = user.name;
                req.session.surname = user.surname;
                console.log(req.session.name);
                if(results){
                    res.redirect('/')
                }

                else{
                    req.flash('error', 'Password and/or email incorrect. Please try again');
                    return  res.redirect('/login');
                }
            });
        })
    })

});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

module.exports = router;
