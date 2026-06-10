import { seedDatabase } from './seedData.js';

console.log('\nSeeding ProctorCode database...\n');
seedDatabase((msg) => console.log(msg));
console.log('\nDone.\n');
console.log('  Admin login:     admin@proctorcode.dev / admin123');
console.log('  Candidate login: candidate@proctorcode.dev / test123\n');
