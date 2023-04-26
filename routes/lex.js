const { LexRuntimeServiceClient, PostTextCommand } = require("@aws-sdk/client-lex-runtime-service");
const { DynamoDBClient, PutItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();

const app = express();
app.use(bodyParser.json());

const AWS_REGION = 'us-east-1';

const lexClient = new LexRuntimeServiceClient({
  region: AWS_REGION,
});

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
});

const BOT_NAME = 'pbot';
const BOT_ALIAS = 'mybot';
const DYNAMO_TABLE = 'P2Table';

router.post('/', async (req, res) => {
  const message = req.body.text;

  const lexParams = {
    botAlias: BOT_ALIAS,
    botName: BOT_NAME,
    inputText: message,
    userId: req.session.id,
  };

  try {
    const lexResponse = await lexClient.send(new PostTextCommand(lexParams));
    console.log(lexResponse)

    if (lexResponse.intentName === 'AddContact' && lexResponse.dialogState === 'Fulfilled') {
      const { fname, lname, phone, email } = lexResponse.slots;

      const params = {
        TableName: DYNAMO_TABLE,
        Item: {
          phone: { S: phone },
          fname: { S: fname },
          lname: { S: lname },
          email: { S: email },
        },
      };

      try {
        await ddbClient.send(new PutItemCommand(params));
        // console.log(dbRes)
        res.send({ resp: lexResponse.message })
      } catch (err) {
        res.send({ resp: err.message })
        console.log(err.message)
      }


    } else if (lexResponse.intentName === 'SearchContact' && lexResponse.dialogState === 'ReadyForFulfillment') {
      const { fname, lname } = lexResponse.slots;

      let searchParam = {
        TableName: DYNAMO_TABLE,
        ExpressionAttributeValues: {},
      };
      searchParam.FilterExpression = 'fname = :fname AND lname = :lname';
      searchParam.ExpressionAttributeValues[':fname'] = { S: fname };
      searchParam.ExpressionAttributeValues[':lname'] = { S: lname };

      console.log("looking for item")
      const searchResults = await ddbClient.send(new ScanCommand(searchParam));
      console.log("searchResults")
      console.log(searchResults)

      console.log(searchResults.Items[0].fname)
      if (searchResults.Items.length > 0) {
        res.send({ resp: `Contacto encontrado: ${searchResults.Items[0].fname["S"]} ${searchResults.Items[0].lname["S"]}, Tel.: ${searchResults.Items[0].phone["S"]}, Correo: ${searchResults.Items[0].email["S"]}` });
      } else {
        res.send({ resp: 'Contacto no encontrado' });
      }
    } else {
      res.send({ resp: lexResponse.message })
    }
  } catch (error) {
    console.log('Error:', error);
    res.status(500).send({ resp: 'Error en el servidor' });
  }
});

module.exports = router;