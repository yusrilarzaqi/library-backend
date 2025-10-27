const responseHelper = {
  success: (res, data, message = "Success", statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  },
  error: (res, message = "Error", statusCode = 500, errors = null) => {
    const response = {
      success: false,
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  },
  notFound: (res, resource = "Resource") => {
    return res.status(404).json({
      success: false,
      message: `${resource} not found`,
    });
  },
  validationError: (res, errors, message = "Validation failed") => {
    return res.status(400).json({
      success: false,
      message,
      errors,
    });
  },
};

module.exports = responseHelper;
