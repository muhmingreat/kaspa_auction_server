const fs = require('fs');
console.log('Node environment test: START');
try {
    fs.writeFileSync('test_output.txt', 'Node is working');
    console.log('File written successfully.');
} catch (e) {
    console.error('File write failed:', e);
}
console.log('Node environment test: END');
