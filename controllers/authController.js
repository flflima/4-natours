const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// eslint-disable-next-line arrow-body-style
const signToken = (id) => {
  return jwt.sign(
    {
      id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    }
  );
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
  });

  const token = signToken(newUser._id);

  // remove passsword from body response on signup
  newUser.password = undefined;

  res.status(201).json({
    status: 'success',
    token,
    data: {
      user: newUser,
    },
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Check if email and password exists
  if (!email || !password) {
    next(new AppError('Please provide email and password!', 400));
  }

  // check if user exists and if password is correct
  const user = await User.findOne({
    email: email,
  }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    next(new AppError('Incorrect email or password!', 401));
  }

  // send token
  const token = signToken(user._id);

  res.status(200).json({
    status: 'success',
    token,
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  // get the token
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please login to get access.', 401)
    );
  }

  // validate the token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // check if user exists
  const currentUser = await User.findById(decoded.id);

  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exists!', 401)
    );
  }

  // check if user changed password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password. PLease login again!', 401)
    );
  }

  req.user = currentUser;

  next();
});
