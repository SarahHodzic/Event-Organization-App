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


// Set up multer for image upload
/*const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'profile_photo/'); // Folder where images will be saved
  },
  filename: function(req, file, cb) {
    cb(null, `${req.params.userId}-${Date.now()}${path.extname(file.originalname)}`); // Filename format
  }
});*/

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '../public/profile_photo')); // Apsolutna putanja
  },
  filename: function(req, file, cb) {
    cb(null, `${req.params.userId}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const storage_cover_photo = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '../public/cover_photo')); // Apsolutna putanja
  },
  filename: function(req, file, cb) {
    cb(null, `${req.params.userId}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const storage_events = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '../public/events')); // Apsolutna putanja
  },
  filename: function(req, file, cb) {
    cb(null, `${req.params.userId}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage: storage });
const upload_cover_photo = multer({ storage: storage_cover_photo });
const event_photos = multer({ storage: storage_events });


router.get('/application-record',async function(req,res,done){
  await pool.connect(async (error,client,done) => {
    if(error)
      return res.status(500).json({error: "Error while trying to connect to database" + error})
    await client.query(`SELECT a.*,
                        apps.name AS application_status_name,
                        e.name AS event_name,
                        u.name AS user_name,
                        u.surname AS user_surname,
                        u.email AS user_email 
                        FROM application a
                        LEFT JOIN application_status apps ON apps.id = a.status_id
                        LEFT JOIN event e ON e.id = a.event_id
                        LEFT JOIN users u ON u.id = a.user_id
                        WHERE e.organizer_id = $1
                        ORDER BY a.id
                        `, [req.session.userId], (error1, result) => {
      if (error1)
        return res.status(500).json({error: "Error while trying to fetch data" + error1})
      client.query('select * from users where id = $1' , [req.session.userId], (error2, result1) => {

        if(error2)
          return res.status(500).json({error: "Error while fetching data from database " + error1})

        const application_info = result.rows;
        const user = result1.rows[0];

        res.render('application_overview', {
          title: 'Eventify',
          name: user.name,
          surname: user.surname,
          email: user.email,
          userId: req.session.userId,
          userType: req.session.userType,
          application_info : application_info,
          users: user
        })
      })
    })
  })
})


/* GET organiser profile page. */
router.get('/:organiser_id', async function(req, res, next) {
  const organiserId = req.params.organiser_id;

  await pool.connect(async (error, client, done) => {
    if (error) {
      return res.status(500).json({ error: "Error while trying to connect on database: " + error });
    }

    // Upit za dohvaćanje broja događaja i korisničkih informacija
    const query = `
      SELECT u.id, u.email,u.background_image, u.profile_picture, u.name, u.surname, COUNT(e.organizer_id) AS event_count 
      FROM users u
      LEFT JOIN event e ON u.id = e.organizer_id
      WHERE u.id = $1
      GROUP BY u.id;
    `;
    //const values = [req.session.userId]; //id iz url-a
    const values = [organiserId];
    await client.query(query, values, async (err, result) => {
      done();
      if (err) {
        return res.status(500).json({error: 'Error while fetching data from database: ' + err});
      }

      if (result.rows.length === 0) {
        return res.status(404).json({error: "User not found."});
      }
      const query1 = `
      select * from location
    `;

      await client.query(query1, [], async (err, result1) => {
        //done();
        if (err) {
          return res.status(500).json({error: 'Error while fetching data from database: ' + err});
        }

        const query2 = `
      select * from event_category
    `;

        await client.query(query2, [], async (err, result2) => {
          //done();
          if (err) {
            return res.status(500).json({error: 'Error while fetching data from database: ' + err});
          }

          // Upit za dohvatanje kategorija
          const eventsQuery  = `SELECT 
                                            e.*, 
                                            l.name AS location_name, 
                                            c.name AS category_name,
                                            es.name AS status_name 
                                        FROM 
                                            event e
                                        LEFT JOIN 
                                            location l ON e.location_id = l.id
                                        LEFT JOIN 
                                            event_category c ON e.category_id = c.id
                                        LEFT JOIN 
                                            event_status es ON e.event_status_id = es.id
                                        WHERE 
                                            e.organizer_id = $1;
`;
          await client.query(eventsQuery , values, async (err, eventsResult) => {
            if (err) {
              return res.status(500).json({error: 'Error while fetching categories from database: ' + err});
            }

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
            console.log("EVENTS", events)
            const categories = result2.rows;
            console.log("KATEGORIJE", categories)

            const locations = result1.rows;
            console.log("LOKACIJE", locations)

            const user = result.rows[0];

            console.log("USER", user)

            res.render('organiser', {
              title: 'Eventify',
              name: req.session.name,
              surname: req.session.surname,
              email: req.session.email,
              userId: req.session.userId,
              userType: req.session.userType,
              organizer: user,
              profilePicture: user.profile_picture || '/images/default-profile.png', // Default slika
              backgroundPicture: user.background_image,
              event_numbers: user.event_count, // Broj događaja
              locations: locations,
              categories: categories,
              events: events
            });
          });
        });
      });
    });
  });
});

router.get('/profile-photo', function (req, res) {
  res.render('index', {title: "eventiry"})
})

/* POST profile photo */
router.post('/profile-photo/:userId', upload.single('profilePhoto'), async function(req, res) {
  const userId = req.params.userId;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const profilePhotoPath = `/profile_photo/${req.file.filename}`; // Path to store in database
  console.log("profilePohotoPath", profilePhotoPath);

  try {
    const client = await pool.connect();
    const query = 'UPDATE users SET profile_picture = $1 WHERE id = $2';
    const values = [profilePhotoPath, userId];

    await client.query(query, values);
    client.release();

    res.status(200).json({ message: 'Profile picture updated successfully', profilePicture: profilePhotoPath });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile picture: ' + error });
  }
});

/* POST cover photo */
router.post('/cover-photo/:userId', upload_cover_photo.single('coverPhoto'), async function(req, res) {
  const userId = req.params.userId;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const coverPhotoPath = `/cover_photo/${req.file.filename}`; // Path to store in database
  console.log("coverPhotoPath", coverPhotoPath);

  try {
    const client = await pool.connect();
    const query = 'UPDATE users SET background_image = $1 WHERE id = $2';
    const values = [coverPhotoPath, userId];

    await client.query(query, values);
    client.release();

    res.status(200).json({ message: 'Cover picture updated successfully', profilePicture: coverPhotoPath });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile picture: ' + error });
  }
});

/* POST edit profile*/
router.post('/edit-profile/:userId', async function(req, res) {
  const userId = req.params.userId;
  const data = req.body;
  const hashedPassword = await getHashedPassword(data.password);

  try {
    const client = await pool.connect();
    try {
      const query = `UPDATE users SET email = $1, password = $2, name = $3, surname = $4 WHERE id = $5`;
      const values = [data.email, hashedPassword, data.name, data.surname, userId];
      await client.query(query, values);
      // Nakon uspešnog ažuriranja profila
      res.redirect(`/organiser/${userId}`);
    } catch (queryError) {
      res.status(500).send("Error during profile update: " + queryError);
    } finally {
      client.release(); // Uverite se da je konekcija pravilno zatvorena
    }
  } catch (connectionError) {
    res.status(500).send("Error connecting to the database: " + connectionError);
  }
});


/* POST new event*/
router.post('/create-event/:userId', event_photos.single('image'),async function(req, res) {
  const userId = req.params.userId;
  const data = req.body;
  const file = req.file;
  console.log("User_id", userId);
  console.log("DATA ZA NOVI EVENT: ", data);
  console.log("File: ", file);
  const eventPhotoPath = `/events/${req.file.filename}`;
  try {
    const client = await pool.connect();
    try {
      const query = `insert into event (name,date,time,location_id,description,organizer_id,ticket_price,category_id,image)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
      const values = [data.name, data.date, data.time, data.location, data.description, userId, data.price, data.category, eventPhotoPath];
      await client.query(query, values);
      // Nakon uspešnog ažuriranja profila
      res.redirect(`/organiser/${userId}`);
    } catch (queryError) {
      res.status(500).send("Error during profile update: " + queryError);
    } finally {
      client.release(); // Uverite se da je konekcija pravilno zatvorena
    }
  } catch (connectionError) {
    res.status(500).send("Error connecting to the database: " + connectionError);
  }
});

// DELETE events
router.delete('/events/:id', async (req, res) => {
  const eventId = req.params.id;
  const client = await pool.connect();

  try {
    // Upit za brisanje događaja iz baze podataka
    await client.query(`DELETE FROM event WHERE id = $1`, [eventId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error while deleting event:', err);
    res.status(500).json({ success: false, error: 'Failed to delete event' });
  } finally {
    client.release();
  }
});

//EDIT events
router.put('/edit-event/:id', event_photos.single('image'), async (req, res) => {
  const eventId = req.params.id;
  const { name, date, time, location_id, description, category_id, ticket_price } = req.body;
  const client = await pool.connect();
  try {
    let imageUrl = null;

    // Ako postoji nova slika, sačuvaj je i postavi imageUrl
    if (req.file) {
      imageUrl = `/events/${req.file.filename}`;  // Ili putanja gde sačuvaš slike
      await client.query(`UPDATE event
             SET name = $1, date = $2, time = $3, location_id = $4, description = $5, category_id = $6, ticket_price = $7, image = $8
             WHERE id = $9`, [name, date, time, location_id, description, category_id, ticket_price, imageUrl, eventId]);
    }
    else {
      await client.query(`UPDATE event
             SET name = $1, date = $2, time = $3, location_id = $4, description = $5, category_id = $6, ticket_price = $7
             WHERE id = $8`, [name, date, time, location_id, description, category_id, ticket_price, eventId]);
    }
      res.json({ success: true });
    } catch (err) {
      console.error('Error while Editing event:', err);
      res.status(500).json({ success: false, error: 'Failed to edit event' });
    } finally {
      client.release();
    }
});




module.exports = router;
