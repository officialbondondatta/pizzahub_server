import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
app.use(cors());
const PORT = process.env.PORT || 8000;


//home route
app.get("/", (req, res) => {
    res.send("Welcome to PizzaHub API");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});