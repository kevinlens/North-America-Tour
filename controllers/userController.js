const User = require('../models/userModel');
//To catch reject errors from async functions
const catchAsync = require('../utils/catchAsync');
//To output user friendly error
const AppError = require('../utils/appError');
const factory = require('./handlerFactory');

//

//

// Functions and Methods

//'...allowedFields' is an array containing all arguments passed
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  //If the users 'obj' req.body contain the required fields from the array 'allowedFields', then create new object that includes propertie name equal to field names
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el))
      newObj[el] = obj[el];
  });
  //should return back an object with properties
  return newObj;
};

//

//

//

// #) ROUTER HANDLERS
exports.getAllUsers = catchAsync(
  async (req, res, next) => {
    //Collect all user from database
    const users = await User.find();

    // Send Response
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users,
      },
    });
  }
);

//

//

// Update User Data

exports.updateMe = catchAsync(
  async (req, res, next) => {
    // 1) Sends Error if user passes in password in req.body
    if (
      req.body.password ||
      req.body.passwordConfirm
    ) {
      return next(
        new AppError(
          'This route is not for password updates. Please use /updateMyPassword.',
          400
        )
      );
    }

    // 2) Update user document
    const filteredBody = filterObj(
      req.body,
      'name',
      'email'
    );
    //find by id and update with the new filteredBody object
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      filteredBody,
      {
        //setting it as a "new" document
        new: true,
        runValidators: true,
      }
    );
    //Reserved for more sensitive data like password, so use findByIdAndUpdate() instead
    // user.name = 'Jonas';
    // await user.save();

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    });
  }
);

//

//

//

exports.deleteMe = catchAsync(
  async (req, res, next) => {
    //disabling the user by setting "active" property to false
    await User.findByIdAndUpdate(req.user.id, {
      active: false,
    });

    res.status(204).json({
      status: 'success',
      data: null,
    });
  }
);

exports.getUser = factory.getOne(User);

exports.createUser = (req, res) => {
  res.status(500).json({
    status: 'error',
    message:
      'This route is not defined! Please use /signup instead',
  });
};

//Do NOT update passwords with this!
exports.updateUser = factory.updateOne(User);
exports.deleteUser = factory.deleteOne(User);
