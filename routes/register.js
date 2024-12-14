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
    const flashMessages=req.flash('error')[0];
    res.render('register', { title: 'Register', flashMessages });
});

//Testing route
router.get('/interests', async function(req, res, next) {
   await pool.connect(async (error, client, done) =>{
       if(error)
           return res.status(500).json({error: 'greska prilikom konektovanja na bazu ' + err});
       await client.query('select * from event_category', async (err, result1) => {
           done();
           if(err)
               return res.send('nakon pokusaja dohvata kategorija greska' + err)

           console.log(result1.rows)
           res.render('interest', { title: 'Interests', eventCategories: result1.rows, user_id: 6 });
       })
   })
});


router.post('/insert', async function(req,res,done){
    const {email, name, surname, password} = req.body;
    console.log("register form details " + req.body.name);
    console.log(email);
    const hashedPassword = await getHashedPassword(password);
    console.log("hashed password " + hashedPassword);
    await pool.connect(async (error, client, done) => {
        if(error)
            return res.status(500).json({error: 'greska prilikom konektovanja na bazu ' + err});
        await client.query('select email, name, surname from users where email = $1', [email], async (err, result) => {
            if(err){
                done();
                return res.status(500).json({error: 'greska prilikom dohvata podataka iz baze' + err})
            }
            console.log(result.rows.length);
            console.log(result.rows);
            if(result.rows.length > 0){
                req.flash('error', 'That email is already in use. Please try again.')
                done();
                return res.redirect('/register')
            }
            await client.query('insert into users(email,name,surname,password,user_type_id,user_status_id) values($1, $2, $3, $4, 3, 1)', [email, name, surname, hashedPassword], async (error, result) => {
                if(error){
                    done();
                    return res.status(500).json({error: 'greska prilikom unosa podataka u bazu ' + error})
                }
                //done();
                await client.query('select id from users where email = $1' , [email], async (error, result) => {
                    if(error){
                        done();
                        return res.status(500).json({error: 'greska prilikom dohvatanja podataka ' + error})
                    }
                    //done();
                    await client.query('select * from event_category', async (err, result1) => {
                        done();
                        if(err)
                            return res.send('nakon pokusaja dohvata kategorija greska' + err)
                        console.log(result.rows[0].id)
                        console.log(result1.rows)
                        res.render('interest', { title: 'Interests', eventCategories: result1.rows, user_id: result.rows[0].id });
                    })
                })
                //res.redirect('/login')
            })
        })
    })
})

/*Insert interests */
router.post('/insertInterests/:id', async function(req,res,done){
  const userId = req.params.id;
  const { categories } = req.body;


    if (!categories || categories.length === 0) {
        return res.status(400).json({ success: false, message: 'No categories selected.' });
    }

    const values = categories.map(categoryId => `(${userId}, ${categoryId})`).join(', ');

    const insertQuery = `
    INSERT INTO user_event_categories (user_id, event_category_id)
    VALUES ${values}
  `;

    try {
        // Get a client from the pool and execute the query
        const client = await pool.connect();
        await client.query(insertQuery);
        client.release();

        // Respond with success message
        return res.status(200).json({ success: true, message: 'Categories inserted successfully.' });
    } catch (error) {
        console.error('Error inserting categories:', error);
        return res.status(500).json({ success: false, message: 'Failed to insert categories.' });
    }

})

module.exports = router;