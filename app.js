const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/materials', async (req, res) => {
  const materials = await prisma.material.findMany();
  res.json(materials);
});

app.post('/api/materials', async (req, res) => {
  const { name, description, unit, unitPrice } = req.body;
  const material = await prisma.material.create({
    data: { name, description, unit, unitPrice }
  });
  res.json(material);
});

app.post('/api/materials/receive', async (req, res) => {
  const { materialId, quantity, notes } = req.body;
  
  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      materialId,
      quantity,
      type: 'RECEIVE',
      notes
    }
  });
  
  // Update material stock
  await prisma.material.update({
    where: { id: materialId },
    data: { stock: { increment: quantity } }
  });
  
  res.json(transaction);
});

app.post('/api/materials/withdraw', async (req, res) => {
  const { materialId, projectId, quantity, notes } = req.body;
  
  // Check stock
  const material = await prisma.material.findUnique({
    where: { id: materialId }
  });

  console.log(`Material stock: ${material.stock}, Requested quantity: ${quantity}`);
  
  if (material.stock < quantity) {
    return res.status(400).json({ error: 'Insufficient stock' });
  }
  
  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      materialId,
      projectId,
      quantity,
      type: 'WITHDRAW',
      notes
    }
  });
  
  // Update material stock
  await prisma.material.update({
    where: { id: materialId },
    data: { stock: { decrement: quantity } }
  });
  
  res.json(transaction);
});

app.post('/api/materials/return', async (req, res) => {
  const { materialId, projectId, quantity, notes } = req.body;
  
  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      materialId,
      projectId,
      quantity,
      type: 'RETURN',
      notes
    }
  });
  
  // Update material stock
  await prisma.material.update({
    where: { id: materialId },
    data: { stock: { increment: quantity } }
  });
  
  res.json(transaction);
});

app.get('/api/projects', async (req, res) => {
  const projects = await prisma.project.findMany();
  res.json(projects);
});

app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;
  const project = await prisma.project.create({
    data: { name, description }
  });
  res.json(project);
});

app.get('/api/projects/:id/report', async (req, res) => {
  const { id } = req.params;
  
  // Get all transactions for this project
  const transactions = await prisma.transaction.findMany({
    where: { projectId: parseInt(id) },
    include: { material: true }
  });
  
  // Calculate material usage
  const materialUsage = {};
  
  transactions.forEach(t => {
    if (!materialUsage[t.materialId]) {
      materialUsage[t.materialId] = {
        material: t.material,
        totalWithdrawn: 0,
        totalReturned: 0,
        netUsage: 0,
        totalCost: 0
      };
    }
    
    if (t.type === 'WITHDRAW') {
      materialUsage[t.materialId].totalWithdrawn += t.quantity;
    } else if (t.type === 'RETURN') {
      materialUsage[t.materialId].totalReturned += t.quantity;
    }
    
    materialUsage[t.materialId].netUsage = 
      materialUsage[t.materialId].totalWithdrawn - materialUsage[t.materialId].totalReturned;
    
    materialUsage[t.materialId].totalCost = 
      materialUsage[t.materialId].netUsage * t.material.unitPrice;
  });
  
  res.json({
    project: await prisma.project.findUnique({ where: { id: parseInt(id) } }),
    materialUsage: Object.values(materialUsage),
    totalCost: Object.values(materialUsage).reduce((sum, item) => sum + item.totalCost, 0)
  });
});

app.get('/api/transactions', async (req, res) => {
  const { projectId } = req.query;
  // console.log('query params:', req.query); 
  // console.log(`Fetching transactions for projectId: ${projectId}`);
  try {
    let where = {}
    if (projectId) {
      where.projectId = parseInt(projectId);
    }

    // console.log('Fetching transactions with where:', where);
    const transactions = await prisma.transaction.findMany({
      include: {
        material: true,
        project: true
      },
      where:{ ...where },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
module.exports = app; 