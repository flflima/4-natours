const {
  promisify
} = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/email');

// eslint-disable-next-line arrow-body-style
const signToken = (id) => {
  return jwt.sign({
      id,
    },
    process.env.JWT_SECRET, {
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
    role: req.body.role,
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
  const {
    email,
    password
  } = req.body;

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

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(
      new AppError('You do not have permission to perform this action', 403)
    );
  }

  next();
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // get user based on email
  const user = await User.findOne({
    email: req.body.email,
  }).select('+password');
  if (!user) {
    return next(new AppError('There is no user with email address'), 404);
  }

  // generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({
    validateBeforeSave: false,
  });

  // send back as an e-mail
  const resetURL = `${req.protocol}://${req.get('host')}/ap1/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\n If ou didn't forget your password, please ignore this email!`;

  try {
    await sendEmail({
      email: user.email,
      subect: 'Your password reset token (valid for 10 minutes)',
      message
    });

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    console.log(err)
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({
      validateBeforeSave: false
    });

    return next(new AppError('There was an error sending an email. Try again later!', 500));
  }
});

exports.resetPassword = (req, res, next) => {};