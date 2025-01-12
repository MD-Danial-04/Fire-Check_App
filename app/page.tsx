'use client'

import { Bell, Settings, Search, Plus } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useEffect, useState } from 'react'

// Add interfaces for props and data types
interface MetricCardProps {
  title: string;
  value: string;
  change: string;
}

interface ActivityItemProps {
  title: string;
  timestamp: string;
}

// Sample data for charts
const weeklyData = [
  { name: 'Mon', cylinders: 65, personnel: 45 },
  { name: 'Tue', cylinders: 72, personnel: 48 },
  { name: 'Wed', cylinders: 68, personnel: 42 },
  { name: 'Thu', cylinders: 75, personnel: 46 },
  { name: 'Fri', cylinders: 70, personnel: 44 },
  { name: 'Sat', cylinders: 63, personnel: 40 },
  { name: 'Sun', cylinders: 60, personnel: 38 },
]

const statusData = [
  { name: 'Active', value: 65 },
  { name: 'Maintenance', value: 15 },
  { name: 'Reserved', value: 20 },
]

export default function Dashboard() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return null
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input 
                type="search" 
                placeholder="Search..." 
                className="pl-10 bg-neutral-50 border-0 w-full focus-visible:ring-neutral-900"
                aria-label="Search"
                role="searchbox"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-neutral-500"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-neutral-500"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-neutral-200"></div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium text-neutral-900">Dashboard</h1>
            <Button className="bg-neutral-900 hover:bg-neutral-800">
              <Plus className="mr-2 h-4 w-4" /> Add New
            </Button>
          </div>

          {/* Metric Cards */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Cylinders"
              value="150"
              change="+12%"
            />
            <MetricCard
              title="Personnel Available"
              value="45"
              change="+5%"
            />
            <MetricCard
              title="Upcoming Servicing"
              value="12"
              change="-2%"
            />
            <MetricCard
              title="Assigned Roles"
              value="38"
              change="+8%"
            />
          </div>

          {/* Charts Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-neutral-600">Weekly Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" stroke="#666" />
                      <YAxis stroke="#666" />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="cylinders" 
                        stroke="#000" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="personnel" 
                        stroke="#666" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-neutral-600">Cylinder Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" stroke="#666" />
                      <YAxis stroke="#666" />
                      <Tooltip />
                      <Bar dataKey="value" fill="#000" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-600">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <ActivityItem
                  title="Cylinder 101 assigned to John Doe"
                  timestamp="2 hours ago"
                />
                <ActivityItem
                  title="New personnel added: Jane Smith"
                  timestamp="5 hours ago"
                />
                <ActivityItem
                  title="Duty Sheet generated for next week"
                  timestamp="1 day ago"
                />
                <ActivityItem
                  title="Cylinder 103 due for servicing"
                  timestamp="1 day ago"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

// Update MetricCard component with accessibility and types
const MetricCard = ({ title, value, change }: MetricCardProps) => {
  if (!title || !value || !change) return null;
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-600" role="heading" aria-level={3}>
            {title}
          </p>
          <span 
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-900"
            role="status"
            aria-label={`Change: ${change}`}
          >
            {change}
          </span>
        </div>
        <div className="mt-2 flex items-baseline">
          <p className="text-2xl font-medium text-neutral-900" role="status" aria-label={`Value: ${value}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Update ActivityItem component with proper timestamp handling
const ActivityItem = ({ title, timestamp }: ActivityItemProps) => {
  if (!title || !timestamp) return null;

  const getISOString = (timeString: string) => {
    if (!timeString) return new Date().toISOString();
    
    if (timeString.includes('ago')) {
      return new Date().toISOString();
    }
    
    try {
      return new Date(timeString).toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  };

  return (
    <div className="flex items-center gap-4" role="listitem">
      <div className="h-2 w-2 rounded-full bg-neutral-200" aria-hidden="true"></div>
      <div className="flex-1">
        <p className="text-sm text-neutral-900">{title}</p>
        <time 
          className="text-sm text-neutral-500" 
          dateTime={getISOString(timestamp)}
        >
          {timestamp}
        </time>
      </div>
    </div>
  )
}

