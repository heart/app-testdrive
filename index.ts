require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;
const multer = require("multer");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const dateFormat = require("dateformat");
const cookieParser = require("cookie-parser");

var Datastore = require("nedb"),
  db = new Datastore({
    filename: "database/data_user.db",
  });
db.loadDatabase();

const bcrypt = require("bcrypt");
const saltRounds = 10;
var myPlaintextPassword = "";
const someOtherPlaintextPassword = "not_bacon";

var jwt = require("jsonwebtoken");

const myBodyParser = bodyParser.urlencoded({
  extended: true,
});

app.use(cookieParser());
app.use(myBodyParser);

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

let getEnv = (name) => {
  return process.env[name];
};

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync("upload")) {
      fs.mkdirSync("upload");
    }
    cb(null, "upload");
  },
  filename: function (req, file, cb) {
    var dateString = new Date().getTime(); //dateFormat(new Date(), "yyyymmmdS_hh_MM_ss");
    cb(null, `${dateString}${path.extname(file.originalname)}`);
  },
});
var upload = multer({
  storage: storage,
});

app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));

app.set("view engine", "ejs");

app.get("/", function (req, res) {
  res.render("index");
});

app.get("/favicon.ico", function (req, res) {
  res.sendFile(path.join(__dirname, `public/favicon.ico`));
});

app.get("/site.webmanifest", function (req, res) {
  res.sendFile(path.join(__dirname, `public/site.webmanifest`));
});

app.get("/robots.txt", function (req, res) {
  res.sendFile(path.join(__dirname, `public/robots.txt`));
});

app.delete("/temp", function (req, res) {
  if (getEnv("UPLOAD_SECRET") != req.header("Authorization")) {
    res.status(500).send("Access Denied.");
    fs.unlinkSync(req.file.path);
  } else {
    const directoryPath = path.join(__dirname, `upload`);
    fs.readdir(directoryPath, function (err, files) {
      if (err) {
        return console.log("Unable to scan directory: " + err);
      }
      for (let i in files) {
        fs.unlinkSync(`${directoryPath}/${files[i]}`);
      }
      res.send({
        success: true,
      });
    });
  }
});

app.delete("/upload/:customer/:environment/:file", function (req, res) {
  if (getEnv("UPLOAD_SECRET") != req.header("Authorization")) {
    res.status(500).send("Access Denied.");
    fs.unlinkSync(req.file.path);
  } else {
    let environment = req.params.environment;
    let customer = req.params.customer;
    let filePrefix = req.params.file;
    const directoryPath = path.join(
      __dirname,
      `downloads/${customer}/${environment}`
    );
    fs.readdir(directoryPath, function (err, files) {
      if (err) {
        return console.log("Unable to scan directory: " + err);
      }

      for (let i in files) {
        if (files[i].startsWith(filePrefix)) {
          fs.unlinkSync(`${directoryPath}/${files[i]}`);
        }
      }

      res.send({
        success: true,
      });
    });
  }
});

app.post(
  "/upload/:environment",
  upload.single("file"),
  function (req, res, next) {
    const file = req.file;
    if (!file) {
      res.status(500).send("No File upload.");
      return;
    }

    if (getEnv("UPLOAD_SECRET") != req.header("Authorization")) {
      res.status(500).send("Access Denied.");
      fs.unlinkSync(req.file.path);
    } else {
      let environment = req.params.environment;
      let uploadPath = `downloads/${req.body.customer}/${environment}`;

      if (!fs.existsSync("downloads")) {
        fs.mkdirSync("downloads");
      }
      if (!fs.existsSync(`downloads/${req.body.customer}`)) {
        fs.mkdirSync(`downloads/${req.body.customer}`);
      }
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath);
      }

      let destFilename = `${uploadPath}/${req.file.filename}`;

      fs.copyFile(req.file.path, destFilename, (err) => {
        if (err) {
          console.log(err);
        }
        fs.unlinkSync(req.file.path);
      });

      if (req.body.platform == "ios") {
        let plistFilkeName = req.file.filename.split(".")[0] + ".plist";
        let plistFile = createPlistFile(
          destFilename,
          req.body.app_id,
          req.body.version,
          req.body.app_name
        );
        fs.writeFile(
          `${uploadPath}/${plistFilkeName}`,
          plistFile,
          function (err) {
            if (err) return console.log(err);
          }
        );
      }

      res.send({
        success: true,
      });
    }
  }
);

app.get("/android/:customer/:environment", function (req, res) {
  let environment = req.params.environment;
  let customer = req.params.customer;

  const directoryPath = path.join(
    __dirname,
    `/downloads/${customer}/${environment}`
  );

  fs.readdir(directoryPath, function (err, files) {
    if (err) {
      res.status(404).send("Page Not Found.");
      return console.log("Unable to scan directory: " + err);
    }

    let binaryFile = [];
    for (let i in files) {
      if (files[i].endsWith(".apk")) {
        let data = {
          link:
            getEnv("SERVER_URL") +
            `/downloads/${customer}/${environment}/` +
            files[i],
          name: files[i].split(".")[0],
        };
        binaryFile.push(data);
      }
    }
    binaryFile.sort().reverse();

    res.render("download", {
      platform: "android",
      iosLink: `/ios/${req.params.customer}/${req.params.environment}`,
      androidLink: `/android/${req.params.customer}/${req.params.environment}`,
      customer: req.params.customer,
      environment: req.params.environment,
      files: binaryFile,
      dateFormat: dateFormat,
    });
  });
});

app.get("/ios/:customer/:environment", function (req, res) {
  let environment = req.params.environment;
  let customer = req.params.customer;

  const directoryPath = path.join(
    __dirname,
    `/downloads/${customer}/${environment}`
  );

  fs.readdir(directoryPath, function (err, files) {
    if (err) {
      res.status(404).send("Page Not Found.");
      return console.log("Unable to scan directory: " + err);
    }

    // files.sort().reverse()

    let binaryFile = [];
    for (let i in files) {
      if (files[i].endsWith(".plist")) {
        let data = {
          link:
            "itms-services://?action=download-manifest&url=" +
            getEnv("SERVER_URL") +
            `/downloads/${customer}/${environment}/` +
            files[i],
          name: files[i].split(".")[0],
        };
        binaryFile.push(data);
      }
    }
    binaryFile.sort().reverse();

    res.render("download", {
      platform: "ios",
      iosLink: `/ios/${req.params.customer}/${req.params.environment}`,
      androidLink: `/android/${req.params.customer}/${req.params.environment}`,
      customer: req.params.customer,
      environment: req.params.environment,
      files: binaryFile,
      dateFormat: dateFormat,
    });
  });
});

function createPlistFile(fileName, appId, appVersion, appName) {
  let baseUrl = getEnv("SERVER_URL");
  return `<?xml version="1.0" encoding="UTF-8"?>
                                                <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                                                <plist version="1.0">
                                                <dict>
                                                  <key>items</key>
                                                  <array>
                                                    <dict>
                                                      <key>assets</key>
                                                      <array>
                                                        <dict>
                                                          <key>kind</key>
                                                          <string>software-package</string>
                                                          <key>url</key>
                                                          <string>${baseUrl}/${fileName}</string>
                                                        </dict>
                                                        <dict>
                                                          <key>kind</key>
                                                          <string>display-image</string>
                                                          <key>url</key>
                                                          <string>${baseUrl}/public/icon1.png</string>
                                                        </dict>
                                                        <dict>
                                                          <key>kind</key>
                                                          <string>full-size-image</string>
                                                          <key>url</key>
                                                          <string>${baseUrl}/public/icon2.png</string>
                                                        </dict>
                                                      </array>
                                                      <key>metadata</key>
                                                      <dict>
                                                        <key>bundle-identifier</key>
                                                        <string>${appId}</string>
                                                        <key>bundle-version</key>
                                                        <string>${appVersion}</string>
                                                        <key>kind</key>
                                                        <string>software</string>
                                                        <key>platform-identifier</key>
                                                        <string>com.apple.platform.iphoneos</string>
                                                        <key>title</key>
                                                        <string>${appName}</string>
                                                      </dict>
                                                    </dict>
                                                  </array>
                                                </dict>
                                                </plist>
                                                `;
}

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

app.get("/formuser", function (req, res) {
  res.render("formuser");
});

function checkCookie(req, res, next) {
  jwt.verify(req.cookies.token, getEnv("UPLOAD_SECRET"), function (err, data) {
    console.log(err);

    if (!err) {
      console.log(data.username);
      next();
    } else {
      res
        .cookie("token", "", {
          expires: new Date(),
        })
        .redirect(301, "formuser")
        .send("No login");
    }
  });
}

app.get("/manager", [checkCookie], function (req, res) {
  let environment = req.params.environment;
  let customer = "";
  const directoryPath = path.join(__dirname, "/downloads"); //${customer}/${environment}`)
  //console.log(directoryPath);

  fs.readdir(directoryPath, function (err, files) {
    let folderList = files.filter(function (f) {
      let fpath = path.join(__dirname, `/downloads/${f}`);
      let stat = fs.statSync(fpath);
      return stat.isDirectory();
    });
    console.log(folderList);
    res.render("manager_folderlist", {
      folder: folderList,
      customer: customer,
    });
  });
});

app.get("/manager/:customer", [checkCookie], function (req, res) {
  let environment = req.params.environment;
  let customer = req.params.customer;
  console.log(customer);

  const directoryPath = path.join(
    __dirname,
    `/downloads/${req.params.customer}`
  ); //${customer}/${environment}`)
  //console.log(directoryPath);

  fs.readdir(directoryPath, function (err, files) {
    let folderList = files
      .filter(function (f) {
        let fpath = path.join(
          __dirname,
          `/downloads/${req.params.customer}/${f}`
        );
        let stat = fs.statSync(fpath);

        console.log();

        return stat.isDirectory();
      })
      .map(function (f) {
        return `${req.params.customer}/${f}`;
      });

    console.log(folderList);
    res.render("manager_folderlist", {
      folder: folderList,
      customer: customer,
    });
  });
});

app.get("/manager/:customer/:environmat", [checkCookie], function (req, res) {
  let environmat = req.params.environmat;
  let customer = req.params.customer;
  const directoryPath = path.join(
    __dirname,
    `/downloads/${req.params.customer}/${req.params.environmat}`
  ); //${customer}/${environment}`)
  //console.log(directoryPath);

  fs.readdir(directoryPath, function (err, files) {
    let folderList = files
      .filter(function (f) {
        let fpath = path.join(
          __dirname,
          `/downloads/${req.params.customer}/${req.params.environmat}/${f}`
        );
        let stat = fs.statSync(fpath);
        console.log();

        return !stat.isDirectory();
      })
      .map(function (f) {
        return `${f}`;
      });

    let binaryFile = [];
    for (let i in files) {
      let data = {
        link:
          "itms-services://?action=download-manifest&url=" +
          getEnv("SERVER_URL") +
          `/downloads/${customer}/${environmat}/` +
          files[i],
        name: files[i].split(".")[0],
      };
      binaryFile.push(data);
    }

    binaryFile.sort().reverse();

    console.log(environmat);

    console.log(folderList);
    res.render("manager_file", {
      files: folderList,
      customer: customer,
      environmat: environmat,
      binaryFile: binaryFile,
      dateFormat: dateFormat,
    });
  });
});

app.post("/createuser", function (req, res) {
  const secret = req.body.secret;
  const username = req.body.username.toLowerCase();
  const password = req.body.password;

  if (getEnv("UPLOAD_SECRET") != secret) {
    res.send("no login");
    return;
  }

  console.log("Status : Secret OK");
  db.find(
    {
      username: username,
    },
    function (err, docs) {
      console.log(docs);
      if (docs.length == 0) {
        bcrypt.hash(password, saltRounds, function (err, hash) {
          db.insert({
            username: username,
            password: hash,
          });
        });
        console.log("Username Created");
        res.status(500).send("Access Denied.");
      } else {
        console.log("Username is already in use.");
        res.status(500).send("Username is already in use.");
      }
    }
  );
});

app.post("/login", function (req, res) {
  const username = req.body.username.toLowerCase();
  const password = req.body.password;

  db.find(
    {
      username: username,
    },
    function (err, docs) {
      console.log(docs);

      if (docs.length != 1) {
        console.log("Username not found");
        res.status(500).send("Username not found.");
      } else {
        bcrypt.compare(password, docs[0].password, function (err, result) {
          if (!result) {
            console.log("Password Incorrect");
            res.status(500).send("Password Incorrect.");
          } else {
            console.log("world OK");
            var token = jwt.sign(
              {
                username: docs[0].username,
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3,
              },
              getEnv("UPLOAD_SECRET")
            );
            res
              .cookie("token", token, {
                secure: true,
                expires: new Date(Date.now() + 4320000),
                httpOnly: true,
              })
              .send({
                success: true,
                token: token,
              });
          }
        });
      }
    }
  );
});


app.get("/select/:customer", function (req, res) {
  let environment = req.params.environment;
  let customer = req.params.customer;
  console.log(customer);

  const directoryPath = path.join(
    __dirname,
    `/downloads/${req.params.customer}`
  ); //${customer}/${environment}`)
  //console.log(directoryPath);

  fs.readdir(directoryPath, function (err, files) {
    let folderList = files
      .filter(function (f) {
        let fpath = path.join(
          __dirname,
          `/downloads/${req.params.customer}/${f}`
        );
        let stat = fs.statSync(fpath);

        console.log();

        return stat.isDirectory();
      })
      .map(function (f) {
        return `${req.params.customer}/${f}`;
      });

    console.log(folderList);
    res.render("download_folderlist", {
      folder: folderList,
      customer: customer,
    });
  });
});