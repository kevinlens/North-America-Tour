//this is to encrypt your unencrypted token
const crypto = require('crypto');
//util already comes built-in with node
const { promisify } = require('util');
//Like a passport used for verification that come built-in already
const jwt = require('jsonwebtoken');
//This serves as the database access point
const User = require('../models/userModel');
//To catch reject errors from async functions
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/email');

//

//

//Token Functions

const signToken = (id) => {
  //signing a signature token, creates new token based on these mixes of arguments passed in
  //generate token with user Id( from database) and secret(from server, in this case vsCode)
  /*Token will be generated based on user info, if it were to be sent back to server
  and somehow the secret has been changed then it will know because it also 
  has its own secret stored in the server which could not be changed.
  e.g would be someone trying to change user--> admin, but in order
  to do that you also have to change the servers SECRET*/
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

//

//

//The response sent back to the user with data
const createSendToken = (user, statusCode, res) => {
  //creates new token to send it back to user to use
  const token = signToken(user._id);

  //

  //

  //persist the token as 'jwt' in cookie, with expiration date
  //cookie modification
  //90days----> miliseconds(formula: 24*60*60*1000)
  const cookieOptions = {
    expires: new Date(
      Date.now() +
        process.env.JWT_COOKIE_EXPIRES_IN *
          24 *
          60 *
          60 *
          1000
    ),
    //makes it so cookie cannot be modified by browser
    httpOnly: true,
  };
  //this means cookie will only be sent on an encrypted connection (https)
  if (process.env.NODE_ENV === 'production')
    //set cookieOptions variable to be secure
    cookieOptions.secure = true;
  //attaching cookie to response object
  //making token more secure by storing it in cookie for user
  // 'jwt' is the name you choose for the cookie
  res.cookie('jwt', token, cookieOptions);

  //

  //

  //removes the password property from showing up to user(output)
  user.password = undefined;

  //this is what you ONLY return back to user in JSON file
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

//

//

//functions

exports.signup = catchAsync(async (req, res, next) => {
  //the create() will also add the data to the database
  //pass in 'req.body' data to (User)schema and create new user
  //this is a security improvement, it allows user to ONLY enter these specific data
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    // //For security reasons don't include these
    // passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
  });
  console.log(newUser);
  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  //1) Check if email and password exist
  if (!email || !password) {
    //it is important to call a return so that the login function finishes right away
    //call upon next middleware
    return next(
      new AppError(
        'Please provide email and password!',
        400
      )
    );
  }
  //2) Check if user exists && password is correct from database
  const user = await User.findOne({
    email,
  }).select('+password');

  /*The 'correctPassword' Instance Method is created by you 
  in the UserSchema ready to be used anytime */
  if (
    !user ||
    !(await user.correctPassword(
      password,
      user.password
    ))
  ) {
    //it is important to call a return so that the login function finishes right away
    return next(
      new AppError('Incorrect email or password', 401)
    );
  }

  //3) If everything works, send token to client
  createSendToken(user, 200, res);
});

//get all tours but checks if token is valid
exports.protect = catchAsync(
  async (req, res, next) => {
    // 1) Get token and check if its there
    let token;
    /*checks to see if the header has authorization mode set up
    and see if it also starts with 'Bearer'*/
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // .split('') will always remove the space and create an array of the two
      //we pick the [1] because it holds the token we want
      token = req.headers.authorization.split(' ')[1];
    }
    //if the token doesnt not exist
    if (!token) {
      return next(
        new AppError(
          'You are not logged in! Please log in to get access',
          401
        )
      );
    }
    // 2) Verifies users token with the server's JWT_SECRET (COMPARING THEM)
    //if verification fails then the program stops and throws and error
    //if successful, it logs the destructured token
    /* { id: '5ed5786cf61bae4d4ad723b6',
        iat: 1591048302,
        exp: 1598824302 } */
    //jwt doesn't have its own promise handler so this will do
    const decoded = await promisify(jwt.verify)(
      token,
      process.env.JWT_SECRET
    );

    // 3) Check if user still exist
    //grabs the VERIFIED user id from decoded, this will always be true because promisify makes sure...
    const currentUser = await User.findById(
      decoded.id
    );
    if (!currentUser) {
      return next(
        new AppError(
          'The user belonging to the token no longer exist.',
          401
        )
      );
    }

    // 4) Check if user changed password after the token was issued
    //iat stands for token 'ISSUED AT', basically an entire date()
    if (
      currentUser.changedPasswordAfter(decoded.iat)
    ) {
      return next(
        new AppError(
          'User recently changed password! Please log in again.',
          401
        )
      );
    }

    //If none of the above is true, then grant access to protected route down below
    //setting user to id for later use
    /*This is important because it sets up the user info for the 
    rest of the express application without having to get the user
    by id over and over. It is so that you can use the currently 
    logged in user's info*/
    req.user = currentUser;
    next();
  }
);

/*this always creates an array when you do the '...roles' from the parameter,
and RESTRICT access only to specific roles*/
// e.g: [roles1, roles2]
exports.restrictTo = (...roles) => {
  //returns a middleware function that has access to the roles parameter
  return (req, res, next) => {
    // roles ['admin', 'lead-guide'], if req.user.role="user" then you don't have permission
    /*for more info about 'req.user' take a look at authController
   .protect() function*/
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have permission to perfom this action',
          403
        )
      );
    }
    next();
  };
};

//when user forgets password and enters data into req.body to get it back
exports.forgotPassword = catchAsync(
  async (req, res, next) => {
    // 1) Get users req.email and find one similar in database
    //"User" references the database
    const user = await User.findOne({
      email: req.body.email,
    });
    //if users email in database does not exist, error message
    if (!user) {
      return next(
        new AppError(
          'There is no user with email address.',
          404
        )
      );
    }
    // 2) Generate the random reset token
    const resetToken = user.createPasswordResetToken();
    //The resetToken only modifies the schema document data, you have to have it to the database
    await user.save({
      //validateBeforeSave() ---> deactivate all validators before saving data to database
      validateBeforeSave: false,
    });

    // 3) Send it to user's email

    //This is the url for resetting the password
    //protocal means "http/https", host means domain name
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    //This is the message sent privately to users email containing the reset url
    const message = `Forgot your password? Submit a PATCH request with your 
    new password and passwordConfirm to: ${resetURL}\nIf you didn't 
    forget your password, please ignore this email!`;

    try {
      //Pass info into the function to send token and message to users email
      await sendEmail({
        email: user.email,
        subject:
          'Your password reset token (valid for 10 min)',
        message,
      });

      res.status(200).json({
        status: 'success',
        message: 'Token sent to email!',
      });
    } catch (err) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      //The commands above only modifies the schema document data, you have to have it to the database
      await user.save({
        //validateBeforeSave() ---> deactivate all validators before saving data to database
        validateBeforeSave: false,
      });

      return next(
        new AppError(
          'There was an error sending the email. Try again later!',
          500
        )
      );
    }
  }
);

//When the user gets the token from their email and enters it
exports.resetPassword = catchAsync(
  async (req, res, next) => {
    // 1) Get user based on the token

    //updates the parameters "email received unencrypted token" from the current route to be encrypted
    //'sha256' is the name of the algorithm
    //Encrypted
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    //"User" references the database
    //finds to see if the same encrypted token exists in the database
    //Encrypted
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    // 2) If token has not expired and user still exists in the database, set the new password

    //if the data cease to be false, error message
    if (!user) {
      return next(
        new AppError(
          'Token is invalid or has expired',
          400
        )
      );
    }
    //officially modify the old password to the new reset password and other properties
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    //The commands above only modifies the schema document data, you have to save it
    await user.save();
    // 3) Update changedPasswordAt property for the user

    // 4) Log the user in, sends new JWT

    //If everything works, send token to client
    createSendToken(user, 200, res);
  }
);

//

//

//

exports.updatePassword = catchAsync(
  async (req, res, next) => {
    // 1) Get user from collection
    /*for more info about 'req.user' take a look at authController
   .protect() function*/
    const user = await User.findById(
      req.user.id
    ).select('+password');
    // 2) Check if POSTed current password is correct
    if (
      !(await user.correctPassword(
        req.body.passwordCurrent,
        user.password
      ))
    ) {
      return next(
        new AppError(
          'Your current password is wrong',
          401
        )
      );
    }
    // 3) If so, update password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    await user.save();
    // 4) Log user in, send JWT
    createSendToken(user, 200, res);
  }
);
