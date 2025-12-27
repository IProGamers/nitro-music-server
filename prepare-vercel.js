#!/usr/bin/env node
/**
 * This script prepares the server for Vercel deployment
 * Run with: node prepare-vercel.js
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Preparing server for Vercel deployment...\n');

// 1. Update Prisma schema to PostgreSQL
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

schema = schema.replace(
    /datasource db \{\s*provider = "sqlite"\s*url\s*= "file:\.\/dev\.db"\s*\}/,
    `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}`
);

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('✅ Updated Prisma schema to use PostgreSQL');

// 2. Update package.json scripts
const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Remove git hooks from postinstall for Vercel
packageJson.scripts.postinstall = 'prisma generate';

// Add vercel-build script
packageJson.scripts['vercel-build'] = 'prisma generate && npm run build';

fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
console.log('✅ Updated package.json scripts for Vercel');

// 3. Create .env.example for reference
const envExample = `# Database (Required for production)
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# Optional: Node environment
NODE_ENV="production"
`;

fs.writeFileSync(path.join(__dirname, '.env.example'), envExample, 'utf8');
console.log('✅ Created .env.example');

console.log('\n🎉 Server is ready for Vercel deployment!');
console.log('\n📝 Next steps:');
console.log('1. Create a PostgreSQL database on Neon.tech');
console.log('2. Add DATABASE_URL to Vercel environment variables');
console.log('3. Deploy to Vercel');
console.log('4. Run migrations: npx prisma migrate deploy');
console.log('\nSee VERCEL_DEPLOYMENT_GUIDE.md for detailed instructions.');
