require 'date'
require 'fileutils'

# Configuration
APPS_DIR = 'apps'
POSTS_DIR = '_posts'
DATE = Date.today.to_s

# Ensure posts directory exists
FileUtils.mkdir_p(POSTS_DIR)

# Get all HTML files in apps directory
apps = Dir.glob(File.join(APPS_DIR, '*.html')).select { |f| File.file?(f) }

apps.each do |app_path|
  filename = File.basename(app_path)
  app_name = File.basename(app_path, '.html').split(/[-_]/).map(&:capitalize).join(' ')
  
  # Skip index.html if present in apps
  next if filename == 'index.html'

  post_filename = "#{DATE}-#{File.basename(app_path, '.html')}.md"
  post_path = File.join(POSTS_DIR, post_filename)

  # Check if post already exists to avoid overwriting (optional, but good practice)
  if File.exist?(post_path)
    puts "Skipping #{post_path} (already exists)"
    next
  end

  content = <<~HEREDOC
    ---
    layout: post
    title: "#{app_name}"
    date: #{DATE} 12:00:00 +0800
    categories: [Apps]
    tags: [web-app, simulation]
    ---
    
    Check out the **#{app_name}** app!
    
    [Open App](/apps/#{filename})
    
    <iframe src="/apps/#{filename}" width="100%" height="600px" style="border:none;"></iframe>
  HEREDOC

  File.write(post_path, content)
  puts "Created #{post_path}"
end

puts "Done! Created posts for #{apps.size} apps."
