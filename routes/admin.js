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

router.get('/', async function(req,res,done) {
  await pool.connect(async (error,client,done)=>{
    if(error)
      return res.status(500).json({error: "Error while trying to connect to database " + error})
    await client.query(`SELECT
                        (SELECT COUNT(*) FROM users) AS total_users,
                        (SELECT COUNT(*) FROM users WHERE user_type_id = 2) AS total_organizers,
                        (SELECT COUNT(*) FROM users WHERE user_type_id = 3) AS total_users_non,
                        (SELECT COUNT(*) FROM users WHERE user_type_id = 1) AS total_admins,
                        (SELECT COUNT(*) FROM event) AS total_events,
                        (SELECT COUNT(*) FROM application) AS total_applications
                    `,[],(error1,result)=>{
      done()
      if(error1)
        return res.status(500).json({error: "Error while trying to fetch data " + error1})
      const stats_info = result.rows[0];
      const userCountsArray = [
        parseInt(stats_info.total_organizers, 10) || 0,
        parseInt(stats_info.total_users_non, 10) || 0,
        parseInt(stats_info.total_admins, 10) || 0
      ];
      console.log("STATS", stats_info);

      console.log(userCountsArray)

  res.render('admin', {
        title: 'Eventify',
        name: req.session.name,
        surname: req.session.surname,
        userId: req.session.userId,
        userType: req.session.userType,
        stats_info: stats_info,
        userCountsArray: userCountsArray
      });
})
  })
})



router.get('/user_overview', async function(req,res,done) {

  await pool.connect(async (error, client, done) => {
    if (error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    const query = `SELECT 
                   * FROM users WHERE user_type_id <> 1`;
    await client.query(query, [], (error1, result) => {
      done();
      if (error1)
        return res.status(500).json({error: "Error while trying to fetch data " + error1})

      const users = result.rows;
      console.log("Users ", users)

      res.render('admin_archive', {
        title: 'Eventify',
        name: req.session.name,
        surname: req.session.surname,
        userId: req.session.userId,
        userType: req.session.userType,
        users: users
      });
    })
  })
})

router.get('/lookup_tables', async function(req,res,done) {

  await pool.connect(async (error, client, done) => {
    if (error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    const query0 = `SELECT * FROM application_status`;

    await client.query(query0, [], async (error1, result0) => {
      done();
      if (error1)
        return res.status(500).json({error: "Error while trying to fetch data " + error1})

      const query1 = `SELECT * FROM event_category`

      await client.query(query1, [], async (error1, result1) => {
        if (error1)
          return res.status(500).json({error: "Error while trying to fetch data " + error1})

        const query3 = `SELECT * FROM location`

        await client.query(query3, [], async (error1, result3) => {
          if (error1)
            return res.status(500).json({error: "Error while trying to fetch data " + error1})

          const application_status = result0.rows;
          const event_category = result1.rows;
          const location = result3.rows;
          console.log("application_status ", application_status)
          console.log("event_category ", event_category)
          console.log("location ", location)

          res.render('admin_lookup', {
            title: 'Eventify',
            name: req.session.name,
            surname: req.session.surname,
            userId: req.session.userId,
            userType: req.session.userType,
            application_status: application_status,
            event_category: event_category,
            location_tab: location,
          });
        })
      })
    })
  })
})

/* Updating user status */
router.put('/status', async function(req,res,done){
  const userId = req.body.id;
  const status = req.body.status;

  console.log("user", userId)
  console.log("status", status)

  await pool.connect((error,client,done)=>{
    if(error)
      res.status(500).json({error:"Error while trying to connect to the database " + error})
    let query;
    if(status === 2)
      query = 'UPDATE users SET user_status_id = 2 WHERE id = $1'
    else
      query = 'UPDATE users SET user_status_id = 3 WHERE id = $1'
    client.query(query,[userId],(error1, result) => {
      done();
      if(error1)
        return res.status(500).json({error:"Error while trying to update database " + error})
      res.json({success: true, id: userId})
    })
  })
})

/*DELETING a row in lookup tables*/
router.delete("/lookup", async function(req,res,done){
  const id = req.body.id;
  const table_id = req.body.table_id;

  console.log("ROW ID", id);
  console.log("TABLE TYPE", table_id);

  let query;
  if(table_id === 1){
    query = 'DELETE FROM application_status WHERE id = $1'
  }
  else if(table_id === 2){
    query = 'DELETE FROM event_category WHERE id = $1'
  }
  else if(table_id === 3){
    query = 'DELETE FROM location WHERE id = $1'
  }

  await pool.connect(async (error,client,done)=> {
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    await client.query(query, [id], (error1, result) => {
      done();
      if(error1)
        return res.status(500).json({error:"Error while trying to delete data " + error1})

      res.json({success: true, id: id})
    })
  })
})

router.post("/addApplication", async function(req,res,done){
  const name = req.body.name;
  const table_id = req.body.table_id;
  let query;
  if(table_id === 1){
    query = 'INSERT into application_status (name) VALUES ($1) RETURNING id'
  }
  else if (table_id === 2){
    query = 'INSERT into event_category (name) VALUES ($1) RETURNING id'
  }
  else if (table_id === 3){
    query = 'INSERT into location (name) VALUES ($1) RETURNING id'
  }
  await pool.connect(async (error,client,done)=>{
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    client.query(query,[name],(error1,result) => {
      done();
      if(error1)
        return res.status(500).json({error: "Error while trying insert data " + error})

      res.json({success: true, name: name, id: result.rows[0].id})
    })
  })
})

router.get('/edit/:id/:table_id',async function(req,res,done){
  const id = req.params.id;
  const table_id = parseInt(req.params.table_id, 10);
  let query;
  let table_type;
  if(table_id === 1){
    query = 'SELECT * FROM application_status WHERE id = $1'
    table_type = "Application Status"
  }
  else if (table_id === 2){
    query = 'SELECT * FROM event_category WHERE id = $1'
    table_type = "Event Category"
  }
  else if (table_id === 3){
    query = 'SELECT * FROM location WHERE id = $1'
    table_type = "Location"
  }

  await pool.connect(async (error,client,done)=>{
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    await client.query(query,[id],(error1, result)=>{
      done();
      if(error1)
        return res.status(500).json({error: "Error while fetching data " + error1})
      const info = result.rows[0];
      res.render('admin_lookup_edit',{
        title: 'Eventify',
        name: req.session.name,
        surname: req.session.surname,
        userId: req.session.userId,
        userType: req.session.userType,
        info:info,
        table_type: table_type,
        table_id: table_id
      })
    })
  })
})

router.post('/edit/:table_id',async function(req,res,done){
  const { id, name } = req.body;
  const table_id = parseInt(req.params.table_id, 10);
  let query;
  if(table_id === 1){
    query = 'UPDATE application_status SET name = $1 WHERE id = $2'
  }
  else if (table_id === 2){
    query = 'UPDATE event_category SET name = $1 WHERE id = $2'
  }
  else if (table_id === 3){
    query = 'UPDATE location SET name = $1 WHERE id = $2'
  }
  await pool.connect(async (error,client,done)=>{
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})
    await client.query(query,[name,id],(error1, result) => {
      if(error1)
        return res.status(500).json({error: "Error while updating data " + error1})
      res.redirect('/admin/lookup_tables');
    })
  })
})


module.exports = router;
