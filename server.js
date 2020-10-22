const dotenv = require('dotenv');

console.log(process.env.NODE_ENV);

dotenv.config({ path: './config.env'});

const app = require('./app');

console.log(process.env);

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`App running on port ${port}`);
});