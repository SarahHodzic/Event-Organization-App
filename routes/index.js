var express = require('express');
var router = express.Router();
const pg = require('pg');
const multer = require('multer');
const path = require('path');
const saltRounds = 10;
const bcrypt = require("bcrypt");
let io = null;
const connectedUsers = new Map(); // Map to store user IDs and their socket IDs
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

async function getChat(receiver_id, sender_id) {
  try {
    const client = await pool.connect();
    const result = await client.query(
        'SELECT * FROM chat WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY timestamp ASC',
        [sender_id, receiver_id]
    );
    client.release();
    return result.rows;
  } catch (error) {
    console.error("Error fetching chat history: ", error);
    return [];
  }
}

router.get('/chat-history/:receiver_id/:sender_id', async (req, res) => {
  const { receiver_id, sender_id } = req.params;
  const chatHistory = await getChat(receiver_id, sender_id);
  res.json(chatHistory);
});


/* GET home page. */
router.get('/', async function(req, res, next) {

  /*CHAT*/

  //console.log("IO", io)
  if(!io){
    console.log("USLO U SOCKET")
    io = require('socket.io')(req.connection.server);
    io.sockets.on('connection', function(client) {
      console.log("USER CONNECTED ", client.id)

      client.on('register', (userId) => {
        connectedUsers.set(userId, client);
        console.log(`User registered with ID ${userId} and socket ID ${client.id}`);
      });

      client.on('chat message', async (data) => {
        const { senderId, receiverId, message } = data;
        console.log("SENDER ID, RECEIVER ID, MESSAGE", senderId, receiverId, message);
        // Save to database
        await pool.query(
            'INSERT INTO chat (sender_id, receiver_id, text) VALUES ($1, $2, $3)',
            [senderId, receiverId, message]
        );

        const receiverSocket = connectedUsers.get(receiverId);
        if (receiverSocket) {
          receiverSocket.emit('newMessage', { senderId, message });
        }
      });


        client.on('disconnect', function () {
          console.log('USER DISCONNECTED ', client.id);
          for (const [userId, userSocket] of connectedUsers.entries()) {
            if (userSocket.id === client.id) {
              connectedUsers.delete(userId);
              console.log(`User with ID ${userId} disconnected`);
              break;
            }
          }
        });
      })

    }





  await pool.connect(async (error, client, done) => {
    if (error)
      return res.status(500).json({error: "Error while trying to connect on database " + error})

    const query = 'SELECT * FROM event_category '
    await client.query(query, [], (error, result) => {
      done();
      if (error)
        return res.status(500).json({error: "Error while fetching data from database " + error})

      client.query('select * from users where id = $1', [req.session.userId], (error1, result1) => {

        if (error1)
          return res.status(500).json({error: "Error while fetching data from database " + error1})

        client.query(`SELECT 
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
                    e.date > current_date 
                    ORDER BY
                    random() 
                    LIMIT 6`, [], (error2, result2) => {


          if (error2)
            return res.status(500).json({error: "Error while fetching data from database " + error2})

          client.query(`SELECT 
                    e.*,
                    l.name AS location_name,
                    c.name AS category_name,
                    es.name AS status_name,
                    u.name AS organizer_name,
                    (SELECT AVG(rating) FROM review WHERE event_id = e.id) AS average_rating,
                    (SELECT COUNT(event_id) FROM application WHERE event_id = e.id) AS application_num,
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
                    ORDER BY average_rating DESC NULLS LAST, application_num DESC
                    LIMIT 6`, [], (error3, result3) => {


            if (error3)
              return res.status(500).json({error: "Error while fetching data from database " + error3})

            client.query(`SELECT 
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
                    JOIN user_event_categories uec ON c.id = uec.event_category_id
                    WHERE uec.user_id = $1
                    LIMIT 6`, [req.session.userId], (error4, result4) => {


              if (error4)
                return res.status(500).json({error: "Error while fetching data from database " + error4})

              client.query('select * from users', [], (error5, result5) => {

                if (error5)
                  return res.status(500).json({error: "Error while fetching data from database " + error5})


                const random_events = result2.rows.map(event => {
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

                const popular_events = result3.rows.map(event => {
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

                const custom_events = result4.rows.map(event => {
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

                const user = result1.rows[0];
                const categories = result.rows;
                const users = result5.rows;


                res.render('home', {
                  title: 'Eventify',
                  name: req.session.name,
                  surname: req.session.surname,
                  userId: req.session.userId,
                  userType: req.session.userType,
                  categories: categories,
                  users: user,
                  random_events: random_events,
                  popular_events: popular_events,
                  custom_events: custom_events,
                  users_chat: users
                });
              })
            })
          })
        })
      })
    })
  })

});

router.post('/search', async (req, res) => {
  const searchTerm = req.body.searchTerm;

  const queryEvents = {
    text: `SELECT e.*, 
                  u.name AS organizer_name, 
                  u.surname AS organizer_surname, 
                  l.name AS location_name,
                  c.name AS category_name,
                  es.name AS status_name 
           FROM event e 
           JOIN users u ON e.organizer_id = u.id 
           JOIN location l ON e.location_id = l.id
           JOIN event_category c ON e.category_id = c.id
           JOIN event_status es ON e.event_status_id = es.id 
           WHERE e.name ILIKE $1 OR u.name ILIKE $1 OR u.surname ILIKE $1 OR CONCAT(u.name, ' ', u.surname) ILIKE $1 OR l.name ILIKE $1`,
    values: [`%${searchTerm}%`],
  };
  const queryUser = {
    text: 'SELECT * FROM users WHERE id = $1',
    values: [req.session.userId],
  };

  try {
    const [eventsResult, userResult] = await Promise.all([
      pool.query(queryEvents),
      pool.query(queryUser),
    ]);

    const events = eventsResult.rows.map(event => {
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
    const user = userResult.rows[0];
    res.render('all_events', { title: 'Eventify',
      name: req.session.name,
      surname: req.session.surname,
      userId: req.session.userId,
      userType: req.session.userType,
      events: events,
      users: user,
      filter:false
    });
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).send('Internal Server Error', err);
  }
});

module.exports = router;
