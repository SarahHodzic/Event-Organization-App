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


router.get('/:id', async function(req,res,done) {
  const userId = req.params.id;

  await pool.connect(async (error, client, done) => {
    if (error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    const query = `SELECT 
                    a.*,
                    e.name,
                    e.ticket_price,
                    e.organizer_id,
                    e.event_status_id,
                    l.name AS location_name,
                    es.name AS status_name,
                    apps.name AS application_status_name,
                    u.email AS organizer_email
                    FROM application a 
                    LEFT JOIN
                    event e on e.id = a.event_id
                    LEFT JOIN
                    location l on e.location_id = l.id 
                    LEFT JOIN
                    event_status es ON e.event_status_id = es.id
                    LEFT JOIN
                    application_status apps on apps.id = a.status_id
                    LEFT JOIN
                    users u on u.id = a.user_id
                    WHERE 
                    a.user_id = $1`;
    await client.query(query, [userId], (error1, result) => {
      done();
      if (error1)
        return res.status(500).json({error: "Error while trying to fetch data " + error1})

      const applications = result.rows;
      console.log("APPLICATIONS ", applications)

      res.render('applications', {
        title: 'Eventify',
        applications: applications
      });
    })
  })
})

router.delete('/delete-application/:id', async function(req, res) {
  const applicationId = req.params.id;

  try {
    const query = 'DELETE FROM application WHERE id = $1';
    await pool.query(query, [applicationId]);

    // Vrati JSON odgovor nakon uspješnog brisanja
    res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Error while trying to cancel the application: " + error });
  }
});

router.put("/status/:type", async function(req,res,done){
  const type = req.params.type;
  const { application_id } = req.body;
  console.log("TYPE" , type)
  console.log("APPLICATION ID" ,application_id);
  let query;
  if(type === "1"){
    query = "UPDATE application SET status_id = 2 WHERE id = $1"
  }
  if(type === "2")
    query = "UPDATE application SET status_id = 3 WHERE id = $1"
  console.log("QUERY" , query)
  await pool.connect(async (error, client, done) =>{
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})
    await client.query(query, [application_id], (error1, result) => {
      done();
      if(error1)
        return res.status(500).json({error: "Error while trying to update data " + error1})
      res.json({success: true})
    })
  })
})


module.exports = router;
