var express = require('express');
var router = express.Router();
const pg = require('pg');
const multer = require('multer');
const path = require('path');
const saltRounds = 10;
const bcrypt = require("bcrypt");
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


router.get('/filter/:selectedValue', async function(req,res,done){
  const selectedValue = req.params.selectedValue;
  console.log("SELCTED VALUE", selectedValue);
  await pool.connect(async (error, client,done) => {
    if(error)
      return res.status(500).json({error: "Error while trying to connect to database" + error})
    await client.query(`SELECT 
                    e.*,
                    l.name AS location_name,
                    c.name AS category_name,
                    es.name AS status_name,
                    u.name AS organizer_name,
                    u.surname AS organizer_surname 
                    FROM event e 
                    LEFT JOIN
                    location l on e.location_id = l.id 
                    LEFT JOIN
                    event_category c ON e.category_id = c.id
                    LEFT JOIN
                    event_status es ON e.event_status_id = es.id
                    LEFT JOIN
                    users u on e.organizer_id = u.id
                    WHERE 
                    e.event_status_id = $1`, [selectedValue], (error1, result) => {
      done();
      if(error1)
        return res.status(500).json({error: "Error while fetching data" + error})
      const data = result.rows.map(event => {
        const formattedDate = new Date(event.date).toLocaleDateString('en-GB').replace(/\//g, '.');
        const formattedTime = new Date(`1970-01-01T${event.time}`).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        return {
          ...event,
          formattedDate,
          formattedTime
        };
      });
      res.json({success:true,data: data})
    })
  })
})

router.get('/sort/:selectedValue', async function(req,res,done){
  const selectedValue = req.params.selectedValue;
  console.log("SELCTED VALUE", selectedValue);
  /*
  <option selected value="1">Date Descending</option>
  <option value="2">Date Ascending</option>
  <option value="3">Price Descending</option>
  <option value="4">Price Ascending</option>
  <option value="5">Rating Descending</option>
  <option value="6">Rating Ascending</option>*/
  let query = `
                      SELECT 
                        e.*,
                        l.name AS location_name,
                        c.name AS category_name,
                        es.name AS status_name,
                        u.name AS organizer_name,
                        u.surname AS organizer_surname ,
                        (SELECT AVG(rating) FROM review WHERE event_id = e.id) AS rating
                      FROM event e 
                      LEFT JOIN location l ON e.location_id = l.id 
                      LEFT JOIN event_category c ON e.category_id = c.id
                      LEFT JOIN event_status es ON e.event_status_id = es.id
                      LEFT JOIN users u ON e.organizer_id = u.id 
                    `;

  switch (selectedValue) {
    case "1":
      query += "ORDER BY e.date DESC"; // Date Descending
      break;
    case "2":
      query += "ORDER BY e.date ASC";  // Date Ascending
      break;
    case "3":
      query += "ORDER BY e.ticket_price DESC"; // Price Descending
      break;
    case "4":
      query += "ORDER BY e.ticket_price ASC";  // Price Ascending
      break;
    case "5":
      query += "ORDER BY rating DESC"; // Rating Descending
      break;
    case "6":
      query += "ORDER BY rating ASC";  // Rating Ascending
      break;
    default:
      query += "ORDER BY e.date DESC"; // Podrazumevano sortiranje
  }
  console.log("QUERY ",query);
  await pool.connect(async (error, client,done) => {
    if(error)
      return res.status(500).json({error: "Error while trying to connect to database" + error})
    await client.query(query , [], (error1, result) => {
      done();
      if(error1)
        return res.status(500).json({error: "Error while fetching data" + error})
      const data = result.rows.map(event => {
        const formattedDate = new Date(event.date).toLocaleDateString('en-GB').replace(/\//g, '.');
        const formattedTime = new Date(`1970-01-01T${event.time}`).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        return {
          ...event,
          formattedDate,
          formattedTime
        };
      });
      res.json({success:true,data: data})
    })
  })
})

/* GET home page. */
router.get('/:category_id', async function(req, res, next) {
  const category_id = req.params.category_id;
  console.log("CATEGORY", category_id);
  let query;
  let filter = false;
  let values;
  if(category_id === '0'){
    query = `SELECT 
                    e.*,
                    l.name AS location_name,
                    c.name AS category_name,
                    es.name AS status_name,
                    u.name AS organizer_name,
                    u.surname AS organizer_surname 
                    FROM event e 
                    LEFT JOIN
                    location l on e.location_id = l.id 
                    LEFT JOIN
                    event_category c ON e.category_id = c.id
                    LEFT JOIN
                    event_status es ON e.event_status_id = es.id
                    LEFT JOIN
                    users u on e.organizer_id = u.id 
                    `
    filter = true;
    values = []
  }
  else {
    query = `SELECT 
                    e.*,
                    l.name AS location_name,
                    c.name AS category_name,
                    es.name AS status_name,
                    u.name AS organizer_name,
                    u.surname AS organizer_surname 
                    FROM event e 
                    LEFT JOIN
                    location l on e.location_id = l.id 
                    LEFT JOIN
                    event_category c ON e.category_id = c.id
                    LEFT JOIN
                    event_status es ON e.event_status_id = es.id
                    LEFT JOIN
                    users u on e.organizer_id = u.id
                    WHERE 
                    e.category_id = $1 
                    `
    values = [category_id]
  }


  await pool.connect(async (error, client, done) => {
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})


    client.query('select * from users where id = $1' , [req.session.userId], (error1, result1) => {
    done();
      if(error1)
        return res.status(500).json({error: "Error while fetching data from database " + error1})

      client.query(query, values, (error2, result2) => {


      if(error2)
        return res.status(500).json({error: "Error while fetching data from database " + error2})


        const events = result2.rows.map(event => {
          const formattedDate = new Date(event.date).toLocaleDateString('en-GB').replace(/\//g, '.');
          const formattedTime = new Date(`1970-01-01T${event.time}`).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });

          return {
            ...event,
            formattedDate,
            formattedTime
          };
        });

         console.log("ALL EVENTS", events)
      const user = result1.rows[0];
        console.log("USER ", user)


        res.render('all_events', {
          title: 'Eventify',
          name: req.session.name,
          surname: req.session.surname,
          userId: req.session.userId,
          userType: req.session.userType,
          users: user,
          events: events,
          filter: filter
        });
      })
    })
    })
});


module.exports = router;
