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
      {
        companyName: 'Apex Electronics Wholesale',
        contactEmail: 'rfq@apexelectronics.com',
        contactPhone: '+1-555-0106',
        categories: ['IT Equipment', 'Electronics', 'Networking'],
        rating: 4.1,
        performanceSummary: 'Strong inventory depth on networking and peripherals. Competitive on bulk orders, average lead times.',
        pastOrdersCount: 19,
        flags: [],
        reviews: [
          { date: '2024-06-11', rating: 4, comment: 'Fair prices, delivery as promised' },
          { date: '2024-01-30', rating: 4, comment: 'Responsive sales team' },
        ],
        isActive: true,
      },
      {
        companyName: 'Meridian Furniture Group',
        contactEmail: 'sales@meridianfurniture.com',
        contactPhone: '+1-555-0107',
        categories: ['Furniture', 'Office Supplies', 'Interior Fit-out'],
        rating: 4.4,
        performanceSummary: 'Premium office furniture with strong warranty and installation services. Higher price point but low defect rate.',
        pastOrdersCount: 27,
        flags: [],
        reviews: [
          { date: '2024-05-19', rating: 5, comment: 'Excellent build quality and installation' },
          { date: '2024-03-02', rating: 4, comment: 'Slightly expensive but worth it' },
        ],
        isActive: true,
      },
      {
        companyName: 'RapidParts Manufacturing',
        contactEmail: 'quotes@rapidparts.com',
        contactPhone: '+1-555-0108',
        categories: ['Industrial Equipment', 'Manufacturing', 'Tools', 'Fasteners'],
        rating: 4.0,
        performanceSummary: 'Fast turnaround on custom industrial parts. Good technical support, occasionally tight on capacity during peak periods.',
        pastOrdersCount: 14,
        flags: [],
        reviews: [
          { date: '2024-04-28', rating: 4, comment: 'Quick quotes and delivery' },
          { date: '2023-11-20', rating: 4, comment: 'Reliable for repeat orders' },
        ],
        isActive: true,
      },
      {
        companyName: 'CloudNine Software Solutions',
        contactEmail: 'procurement@cloudnine.io',
        contactPhone: '+1-555-0109',
        categories: ['Software', 'Cloud Services', 'IT Services'],
        rating: 4.6,
        performanceSummary: 'Enterprise software licensing specialist with excellent compliance documentation and audit support.',
        pastOrdersCount: 18,
        flags: [],
        reviews: [
          { date: '2024-06-01', rating: 5, comment: 'Seamless licensing process' },
          { date: '2024-02-14', rating: 4, comment: 'Good renewal terms' },
        ],
        isActive: true,
      },
      {
        companyName: 'ValueStationery LLC',
        contactEmail: 'orders@valuestationery.com',
        contactPhone: '+1-555-0110',
        categories: ['Stationery', 'Office Supplies', 'Printing'],
        rating: 3.9,
        performanceSummary: 'Dependable mid-market stationery supplier. Consistent quality on core products, limited range for specialty items.',
        pastOrdersCount: 21,
        flags: [],
        reviews: [
          { date: '2024-05-06', rating: 4, comment: 'Consistent and on time' },
          { date: '2024-01-18', rating: 4, comment: 'Good value for standard supplies' },
        ],
        isActive: true,
      },
      {
        companyName: 'Titan Industrial Supply',
        contactEmail: 'rfq@titanindustrial.com',
        contactPhone: '+1-555-0111',
        categories: ['Industrial Equipment', 'Safety Equipment', 'Tools'],
        rating: 3.6,
        performanceSummary: 'Broad industrial catalog including safety gear. Pricing competitive but customer service response times can lag.',
        pastOrdersCount: 9,
        flags: ['slow_response'],
        reviews: [
          { date: '2024-03-25', rating: 3, comment: 'Good prices, slow to respond to queries' },
          { date: '2024-02-08', rating: 4, comment: 'Products as described' },
        ],
        isActive: true,
      },
    ];

    await db.insert(suppliers).values(suppliersData);

    console.log(`✅ Created ${suppliersData.length} sample suppliers`);

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
