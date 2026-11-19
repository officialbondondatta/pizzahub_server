import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient } from "mongodb";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());



const PORT = process.env.PORT || 8001;

//mongodb_connection

const client = new MongoClient(process.env.MONGODB_URI);

const connectToMongoDB = async () => {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("pizzahub");
const users = db.collection("users");


//user routes
app.get("/users", async (req, res) => {
    try {
        const allUsers = await users.find({}).toArray();
        res.json(allUsers);
    } catch (err) {
        console.dir(err);
        res.status(500).send("Error fetching users");
    }
});

app.patch("/users/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        const result = await users.updateOne(
            { _id: new ObjectId(id) },
            { $set: { name: data.name, image: data.image } },
        );
        if (result.matchedCount === 0) {
            res.status(404).send("User not found");
        } else {
            res.send("User updated successfully");
        }
    } catch (err) {
        console.dir(err);
        res.status(500).send("Error updating user");
    }
});





//home route
app.get("/", (req, res) => {
    res.send("Welcome to PizzaHub API");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});