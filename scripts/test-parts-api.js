// Test script for Parts API
// Run with: node scripts/test-parts-api.js

const baseUrl = 'http://localhost:5000/api/v1';

// Sample part data
const samplePart = {
    partName: 'Premium Brake Pad Set',
    description: 'High-performance ceramic brake pads designed for superior stopping power and reduced brake dust. Compatible with multiple vehicle models, these brake pads offer excellent heat dissipation and long-lasting durability.',
    partNumber: 'BP-CERAMIC-2024',
    category: 'Brakes',
    brand: 'Brembo',
    compatibleVehicles: [
        {
            year: 2020,
            make: 'Toyota',
            model: 'Camry',
            variant: 'LE'
        },
        {
            year: 2021,
            make: 'Toyota',
            model: 'Camry',
            variant: 'SE'
        }
    ],
    price: 2500,
    originalPrice: 3000,
    stock: 50,
    specifications: {
        'Material': 'Ceramic',
        'Position': 'Front',
        'Warranty': '2 Years'
    },
    tags: ['brake', 'ceramic', 'toyota', 'safety']
};

async function testCreatePart() {
    console.log('\n🧪 Testing Part Creation (Admin)...');
    console.log('='.repeat(50));

    try {
        const response = await fetch(`${baseUrl}/parts/admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(samplePart),
            credentials: 'include',
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Part created successfully!');
            console.log('Part ID:', data.data.part._id);
            console.log('Part Name:', data.data.part.partName);
            return data.data.part._id;
        } else {
            console.log('❌ Failed to create part:');
            console.log('Status:', response.status);
            console.log('Error:', data.message || data.errors);
            return null;
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return null;
    }
}

async function testGetParts() {
    console.log('\n🧪 Testing Get All Parts (Public)...');
    console.log('='.repeat(50));

    try {
        const response = await fetch(`${baseUrl}/parts?limit=5`);
        const data = await response.json();

        if (response.ok) {
            console.log('✅ Parts retrieved successfully!');
            console.log('Total Parts:', data.pagination.total);
            console.log('Results:', data.results);
            console.log('Parts:', data.data.parts.map(p => `- ${p.partName} (${p.brand})`).join('\n'));
        } else {
            console.log('❌ Failed to get parts:');
            console.log('Status:', response.status);
            console.log('Error:', data.message);
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

async function testGetPartById(partId) {
    console.log('\n🧪 Testing Get Part by ID (Public)...');
    console.log('='.repeat(50));

    try {
        const response = await fetch(`${baseUrl}/parts/${partId}`);
        const data = await response.json();

        if (response.ok) {
            console.log('✅ Part retrieved successfully!');
            console.log('Part Name:', data.data.part.partName);
            console.log('Brand:', data.data.part.brand);
            console.log('Category:', data.data.part.category);
            console.log('Compatible Vehicles:', data.data.part.compatibleVehicles.length);
        } else {
            console.log('❌ Failed to get part:');
            console.log('Status:', response.status);
            console.log('Error:', data.message);
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

async function testFilterParts() {
    console.log('\n🧪 Testing Part Filters (Public)...');
    console.log('='.repeat(50));

    try {
        // Test category filter
        const response1 = await fetch(`${baseUrl}/parts?category=Brakes`);
        const data1 = await response1.json();
        console.log('✅ Filter by category (Brakes):', data1.results, 'parts found');

        // Test vehicle compatibility filter
        const response2 = await fetch(`${baseUrl}/parts?make=Toyota&model=Camry`);
        const data2 = await response2.json();
        console.log('✅ Filter by vehicle (Toyota Camry):', data2.results, 'parts found');

        // Test search
        const response3 = await fetch(`${baseUrl}/parts?search=brake`);
        const data3 = await response3.json();
        console.log('✅ Search "brake":', data3.results, 'parts found');
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

async function runTests() {
    console.log('\n🚀 Starting Parts API Tests');
    console.log('='.repeat(50));
    console.log('Note: Admin endpoints require authentication');
    console.log('You may need to manually test admin endpoints with proper credentials\n');

    // Test public endpoints
    await testGetParts();

    // Test create (will fail without auth - expected)
    const partId = await testCreatePart();

    // If part was created, test get by ID
    if (partId) {
        await testGetPartById(partId);
    }

    // Test filters
    await testFilterParts();

    console.log('\n✨ Tests Complete!');
    console.log('='.repeat(50));
}

// Run tests
runTests();
