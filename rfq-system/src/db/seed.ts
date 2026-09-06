import { db } from './index';
import { users, suppliers, policyDocuments } from './schema';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create procurement admin user
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const [admin] = await db.insert(users).values({
      email: 'admin@procurement.ai',
      passwordHash: adminPasswordHash,
      name: 'Admin User',
      role: 'procurement',
      companyName: 'Demo Procurement Corp',
    }).returning();

    console.log('✅ Created admin user: admin@procurement.ai / admin123');

    // Create sample policy documents
    await db.insert(policyDocuments).values([
      {
        title: 'General Procurement Policy',
        content: `# General Procurement Policy

## Objective
Ensure fair, transparent, and competitive procurement processes.

## Key Requirements
- Minimum 3 quotes for purchases over $10,000
- Competitive bidding for contracts over $50,000
- Vendor diversity and inclusion priorities
- Sustainability and environmental considerations

## Approval Limits
- Under $5,000: Department Manager
- $5,000 - $25,000: Director Level
- $25,000 - $100,000: VP Level
- Over $100,000: Executive Committee

## Vendor Requirements
- Active business registration
- Insurance coverage (General Liability, Workers Comp)
- No conflicts of interest
- Compliance with company code of conduct`,
        category: 'general',
        version: 1,
        isActive: true,
      },
      {
        title: 'IT Equipment Procurement Policy',
        content: `# IT Equipment Procurement Policy

## Approved Vendors
- Must be authorized resellers for hardware manufacturers
- Provide warranty support and service agreements
- Meet cybersecurity compliance requirements

## Standards
- All laptops must support full disk encryption
- Minimum 3-year manufacturer warranty
- Energy Star certified equipment preferred
- Compliance with company security baseline

## Delivery Requirements
- Pre-configured with approved OS image
- Asset tagging and inventory integration
- Packaging disposal and recycling services`,
        category: 'item_specific',
        version: 1,
        isActive: true,
      },
    ]);

    console.log('✅ Created 2 policy documents');

    // Create sample suppliers
    const suppliersData = [
      {
        companyName: 'TechSource Inc.',
        contactEmail: 'quotes@techsource.com',
        contactPhone: '+1-555-0101',
        categories: ['IT Equipment', 'Software', 'Electronics'],
        rating: 4.5,
        performanceSummary: 'Reliable IT supplier with strong track record in enterprise equipment delivery. Consistently meets deadlines.',
        pastOrdersCount: 15,
        flags: [],
        reviews: [
          { date: '2024-01-15', rating: 5, comment: 'Excellent service, on-time delivery' },
          { date: '2024-03-22', rating: 4, comment: 'Good pricing, minor shipping delay' },
        ],
        isActive: true,
      },
      {
        companyName: 'Office Supplies Co.',
        contactEmail: 'sales@officesupplies.com',
        contactPhone: '+1-555-0102',
        categories: ['Office Supplies', 'Furniture', 'Stationery'],
        rating: 4.2,
        performanceSummary: 'Wide product range, competitive pricing on bulk orders. Occasional stock issues on specialized items.',
        pastOrdersCount: 32,
        flags: [],
        reviews: [
          { date: '2024-02-10', rating: 4, comment: 'Great selection and prices' },
        ],
        isActive: true,
      },
      {
        companyName: 'Industrial Parts Ltd.',
        contactEmail: 'rfq@industrialparts.com',
        contactPhone: '+1-555-0103',
        categories: ['Industrial Equipment', 'Manufacturing', 'Tools'],
        rating: 3.8,
        performanceSummary: 'Specialized industrial supplier. Strong technical expertise but higher pricing than competitors.',
        pastOrdersCount: 8,
        flags: ['higher_pricing'],
        reviews: [
          { date: '2024-04-05', rating: 4, comment: 'Excellent technical support' },
          { date: '2023-12-15', rating: 3, comment: 'Prices above market average' },
        ],
        isActive: true,
      },
      {
        companyName: 'GlobalTech Solutions',
        contactEmail: 'procurement@globaltech.com',
        contactPhone: '+1-555-0104',
        categories: ['IT Equipment', 'Cloud Services', 'Software'],
        rating: 4.7,
        performanceSummary: 'Premium IT services provider. Excellent support and warranty terms. Higher cost but superior quality.',
        pastOrdersCount: 22,
        flags: [],
        reviews: [
          { date: '2024-05-01', rating: 5, comment: 'Outstanding service and support' },
          { date: '2024-03-15', rating: 5, comment: 'Best warranty terms in the industry' },
        ],
        isActive: true,
      },
      {
        companyName: 'BudgetOffice Direct',
        contactEmail: 'quotes@budgetoffice.com',
        contactPhone: '+1-555-0105',
        categories: ['Office Supplies', 'Stationery', 'Furniture'],
        rating: 3.5,
        performanceSummary: 'Budget-focused supplier with competitive pricing. Quality can be inconsistent on some items.',
        pastOrdersCount: 12,
        flags: ['quality_concerns'],
        reviews: [
          { date: '2024-04-20', rating: 3, comment: 'Low prices but received damaged items' },
          { date: '2024-02-28', rating: 4, comment: 'Good for basic supplies' },
        ],
        isActive: true,
      },
    ];

    await db.insert(suppliers).values(suppliersData);

    console.log('✅ Created 5 sample suppliers');

    console.log('\n🎉 Database seeded successfully!\n');
    console.log('📝 Login credentials:');
    console.log('   Email: admin@procurement.ai');
    console.log('   Password: admin123\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log('✅ Seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
