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
  const eventId = req.params.id;

  await pool.connect(async (error,client,done) => {
    if (error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    const query = `SELECT 
                    e.*,
                    l.name AS location_name,
                    c.name AS category_name,
                    es.name AS status_name,
                    u.name AS organizer_name,
                    u.surname AS organizer_surname,
                    u.profile_picture AS organizer_profile_picture,
                    u.email AS organizer_email 
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
                    e.id = $1`;
    await client.query(query, [eventId], (error1, result) => {
      done();
      if (error1)
        return res.status(500).json({error: "Error while trying to fetch data " + error1})

      client.query('select * from users where id = $1', [req.session.userId], (error1, result1) => {

        if (error1)
          return res.status(500).json({error: "Error while fetching data from database " + error1})

        client.query(`SELECT r.*,
                    COALESCE((SELECT AVG(rating)
                        FROM review 
                        WHERE $1 = event_id), 0) AS average_rating,
                    u.name,
                    u.surname
                FROM review r
                LEFT JOIN users u on u.id = r.user_id
                WHERE r.event_id = $1`,[eventId],(error2, result2) => {

          if (error2)
            return res.status(500).json({error: "Error while fetching data from database Error2 " + error1})


        const event1 = result.rows[0]
        const review = result2.rows;
          const average_rating = review.length > 0 ? review[0].average_rating : 0;
          console.log("AVERAGE", average_rating)
          console.log(typeof average_rating, average_rating); // Proveri tip i vrednost

          const rounded_average = typeof average_rating === 'number'
              ? parseFloat(average_rating.toFixed(1))
              : typeof average_rating === 'string'
                  ? parseFloat(parseFloat(average_rating).toFixed(1))
                  : 0;

          console.log("REVIEWS ", review)
          console.log("AVERAGE", rounded_average)

        const formattedDate = new Date(event1.date).toLocaleDateString('en-GB').replace(/\//g, '.');
        const formattedTime = new Date(`1970-01-01T${event1.time}`).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        const user = result1.rows[0];
        const event = {
          ...event1,
          formattedDate,
          formattedTime
        };
        console.log("EVENT ", event)

        res.render('individual_event', {
          title: 'Eventify',
          event: event,
          name: req.session.name,
          surname: req.session.surname,
          userId: req.session.userId,
          userType: req.session.userType,
          users: user,
          review: review,
          average_rating: rounded_average,
        });
      })
    })
  })
})
})

router.post('/application/:userId/:eventId', async function(req,res,done){
  const userId = req.params.userId;
  const eventId = req.params.eventId;
  const {phone} = req.body;

  console.log("phone ", phone)

  console.log("eventId ",eventId)
  console.log("userId ", userId)

  await pool.connect( async (error,client,done) => {
    if(error)
      return res.status(500).json({error: "Error while trying to connect to database " + error})

    await client.query(`insert into application (event_id, user_id) values ($1, $2)`,[eventId, userId], (error1,result) => {
      done();
      if(error1)
        res.json({success: false, error: error1})

      res.json({success: true})
    })

  })
})

router.post("/rating",async function(req,res,done){
  const {rating, comment, userId, eventId } = req.body;
  console.log("PODACI",rating, comment,userId,eventId);
  await pool.connect(async (error,client,done)=>{
    if(error)
      return res.status(500).json({error: "Error while trying to connect on database" + error})
    await client.query("INSERT INTO review (user_id, event_id, rating, comment) VALUES ($1, $2, $3, $4)", [userId, eventId, rating, comment], async (error1, result) => {
      done();
      if(error1)
        res.json({success: false, error: error1})
      await client.query(`SELECT AVG(rating) as average_rating FROM review WHERE event_id = $1`, [eventId], (error2, result2) => {
        if(error2)
          res.json({success: false, error: error2})
        const average_rating = result2.rows[0].average_rating
        const rounded_average = typeof average_rating === 'number'
            ? parseFloat(average_rating.toFixed(1))
            : typeof average_rating === 'string'
                ? parseFloat(parseFloat(average_rating).toFixed(1))
                : 0;
        console.log("AVERAGE RATING", average_rating)
      res.json({success: true, average_rating: rounded_average, name: req.session.name,
        surname: req.session.surname,})
    })
  })
  })
})

router.put('/update-status/:id', async (req, res) => {
  const eventId = req.params.id;
  const { status } = req.body;

  try {
    const query = 'UPDATE event SET event_status_id = $1 WHERE id = $2';
    await pool.query(query, [status, eventId]);
    res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating status: ' + error.message });
  }
});


module.exports = router;
