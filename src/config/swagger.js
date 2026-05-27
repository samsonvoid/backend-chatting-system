import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CollabHub API Documentation',
      version: '1.0.0',
      description: 'Production-Grade API Specification for CollabHub Team Collaboration Platform',
      contact: {
        name: 'SVS Development Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT session cookie for secure endpoint authorization',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'u-12345' },
            name: { type: 'string', example: 'Kulwa Khalfan' },
            email: { type: 'string', example: 'kulwa@collabhub.com' },
            avatar: { type: 'string', example: 'KK' },
            status: { type: 'string', example: 'online' },
          },
        },
        RegisterInput: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'Kulwa Khalfan' },
            email: { type: 'string', example: 'kulwa@collabhub.com' },
            password: { type: 'string', example: 'password123' },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', example: 'kulwa@collabhub.com' },
            password: { type: 'string', example: 'password123' },
          },
        },
      },
    },
  },
  // Look for annotations inside the routes files
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

export { swaggerUi, swaggerSpec };
