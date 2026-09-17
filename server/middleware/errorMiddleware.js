export function errorHandler(error, _request, response, _next) {
  if (error.code === 11000) {
    return response.status(409).json({ message: 'A record with those values already exists' });
  }

  if (error.name === 'ValidationError') {
    return response.status(400).json({ message: error.message });
  }

  if (error.statusCode) {
    return response.status(error.statusCode).json({
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    });
  }

  console.error(error);
  return response.status(500).json({ message: 'Internal server error' });
}
